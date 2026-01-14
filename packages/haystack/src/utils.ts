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
 * Make an HTTP request and parse JSON response
 *
 * Simple wrapper around native fetch for API calls. Throws HTTPError for
 * non-2xx responses.
 *
 * @param url - The URL to request
 * @param options - Fetch options
 * @returns Parsed JSON response
 * @throws HTTPError if the response status is not ok
 */
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options)

  if (!response.ok) {
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
