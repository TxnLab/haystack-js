/**
 * HTTP error with status code and response data
 */
export class HTTPError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data: unknown,
  ) {
    super(`HTTP ${status} ${statusText}`)
    this.name = 'HTTPError'
  }
}

/**
 * How many times a request answered `503` with a `Retry-After` is retried.
 * The router answers a quote it is too busy to compute that way, with
 * `Retry-After: 1`; the retry may reach a less busy server.
 */
const BUSY_RETRIES = 1

/**
 * The longest `Retry-After` the SDK waits out. A longer one is thrown as the
 * `HTTPError`, for the caller to decide.
 */
const MAX_RETRY_AFTER_MS = 5_000

/**
 * Make an HTTP request and parse JSON response
 *
 * Simple wrapper around native fetch for API calls. A `503` carrying a
 * `Retry-After` of at most 5 seconds (the router too busy to quote) is
 * retried once after that wait. Throws HTTPError for any other non-2xx
 * response, and for a `503` still answered after its retry.
 *
 * @param url - The URL to request
 * @param options - Fetch options; aborting `options.signal` also ends the wait
 * @returns Parsed JSON response
 * @throws HTTPError if the response status is not ok
 */
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, options)

    if (!response.ok) {
      const wait = attempt < BUSY_RETRIES ? busyRetryDelay(response) : undefined
      if (wait !== undefined) {
        await discardBody(response)
        await delay(wait, options?.signal)
        continue
      }

      let errorData: unknown

      try {
        errorData = await response.json()
      } catch {
        try {
          errorData = await response.text()
        } catch {
          errorData = 'Failed to parse error response'
        }
      }

      throw new HTTPError(
        response.status,
        response.statusText,
        JSON.stringify(errorData),
      )
    }

    return response.json() as Promise<T>
  }
}

/**
 * The wait in milliseconds before retrying a busy `503`: its `Retry-After` in
 * seconds, when it is at most MAX_RETRY_AFTER_MS. Undefined for any other
 * response, which isn't retried.
 */
function busyRetryDelay(response: Response): number | undefined {
  if (response.status !== 503) {
    return undefined
  }
  const header = response.headers?.get('Retry-After')
  if (!header) {
    return undefined
  }
  const ms = Number(header) * 1000
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_RETRY_AFTER_MS
    ? ms
    : undefined
}

/** Reads a response's body to its end, so its connection can be reused. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.text()
  } catch {
    // nothing to free
  }
}

/** Resolves after ms, or rejects with the signal's reason once it aborts. */
function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
