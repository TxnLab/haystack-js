import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RouterClient } from '../src/client'
import type { FetchQuoteResponse } from '../src/types'

vi.mock('../src/utils', () => ({
  request: vi.fn(),
  HTTPError: class HTTPError extends Error {},
}))

describe('First Stage taxed token quotes', () => {
  let client: RouterClient
  let mockRequest: ReturnType<typeof vi.fn>

  const validAddress =
    '5BPCE3UNCPAIONAOMY4CVUXNU27SOCXYE4QSXEQFYXV6ORFQIKVTOR6ZTM'

  const sellQuote: Partial<FetchQuoteResponse> = {
    fromASAID: 2154668640,
    toASAID: 0,
    quote: 5_000_000,
    type: 'fixed-input',
    route: [],
    txnPayload: { iv: 'test-iv', data: 'test-data' },
    requiredAppOptIns: [],
    firstStage: { fromTax: 90_000, toTax: 0, wrapped: ['from'] },
  }

  beforeEach(async () => {
    client = new RouterClient({ apiKey: 'test-api-key' })
    const requestModule = vi.mocked(await import('../src/utils'), {
      partial: true,
    })
    mockRequest = requestModule.request as ReturnType<typeof vi.fn>
    mockRequest.mockReset()
  })

  it('sends the address with the quote request', async () => {
    mockRequest.mockResolvedValue(sellQuote)

    await client.fetchQuote({
      fromASAID: 2154668640,
      toASAID: 0,
      amount: 1_000_000,
      address: validAddress,
    })

    const url = new URL(mockRequest.mock.calls?.[0]?.[0] as string)
    expect(url.searchParams.get('address')).toBe(validAddress)
  })

  it('sends no address when none is given', async () => {
    mockRequest.mockResolvedValue(sellQuote)

    await client.fetchQuote({ fromASAID: 0, toASAID: 31566704, amount: 1 })

    const url = new URL(mockRequest.mock.calls?.[0]?.[0] as string)
    expect(url.searchParams.has('address')).toBe(false)
  })

  it('rejects an invalid address before calling the API', async () => {
    await expect(
      client.fetchQuote({
        fromASAID: 0,
        toASAID: 31566704,
        amount: 1,
        address: 'invalid-address',
      }),
    ).rejects.toThrow('Invalid Algorand address')
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('normalizes the First Stage taxes in newQuote', async () => {
    mockRequest.mockResolvedValue(sellQuote)

    const quote = await client.newQuote({
      fromASAID: 2154668640,
      toASAID: 0,
      amount: 1_000_000,
      address: validAddress,
    })

    expect(quote.quote).toBe(5_000_000n)
    expect(quote.firstStage).toEqual({
      fromTax: 90_000n,
      toTax: 0n,
      wrapped: ['from'],
    })
  })

  it('leaves firstStage undefined for a regular quote', async () => {
    mockRequest.mockResolvedValue({ ...sellQuote, firstStage: undefined })

    const quote = await client.newQuote({
      fromASAID: 0,
      toASAID: 31566704,
      amount: 1_000_000,
    })

    expect(quote.firstStage).toBeUndefined()
  })
})
