import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, HTTPError } from '../src/utils'

describe('HTTPError', () => {
  it('should create an HTTPError with status, statusText, and data', () => {
    const error = new HTTPError(404, 'Not Found', {
      message: 'Resource not found',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('HTTPError')
    expect(error.status).toBe(404)
    expect(error.statusText).toBe('Not Found')
    expect(error.data).toEqual({ message: 'Resource not found' })
    expect(error.message).toBe('HTTP 404 Not Found')
  })
})

describe('request', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('should make a successful GET request', async () => {
    const mockData = { success: true, data: 'test' }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await request('https://api.example.com/data')

    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      undefined,
    )
  })

  it('should make a successful POST request with options', async () => {
    const mockData = { success: true }
    const requestBody = { test: 'data' }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await request('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
  })

  it('should throw HTTPError on non-ok response with JSON error data', async () => {
    const errorData = { error: 'Bad Request', details: 'Invalid input' }

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => errorData,
    })

    await expect(request('https://api.example.com/data')).rejects.toThrow(
      HTTPError,
    )

    try {
      await request('https://api.example.com/data')
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPError)
      if (error instanceof HTTPError) {
        expect(error.status).toBe(400)
        expect(error.statusText).toBe('Bad Request')
        expect(error.data).toBe(JSON.stringify(errorData))
      }
    }
  })

  it('should throw HTTPError with text error data when JSON parsing fails', async () => {
    const errorText = 'Internal Server Error'

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('Invalid JSON')
      },
      text: async () => errorText,
    })

    await expect(request('https://api.example.com/data')).rejects.toThrow(
      HTTPError,
    )

    try {
      await request('https://api.example.com/data')
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPError)
      if (error instanceof HTTPError) {
        expect(error.status).toBe(500)
        expect(error.statusText).toBe('Internal Server Error')
        expect(error.data).toBe(JSON.stringify(errorText))
      }
    }
  })

  it('should throw HTTPError with default message when both JSON and text parsing fail', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => {
        throw new Error('Invalid JSON')
      },
      text: async () => {
        throw new Error('Text parsing failed')
      },
    })

    await expect(request('https://api.example.com/data')).rejects.toThrow(
      HTTPError,
    )

    try {
      await request('https://api.example.com/data')
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPError)
      if (error instanceof HTTPError) {
        expect(error.status).toBe(503)
        expect(error.statusText).toBe('Service Unavailable')
        expect(error.data).toBe(
          JSON.stringify('Failed to parse error response'),
        )
      }
    }
  })

  it('should handle network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    await expect(request('https://api.example.com/data')).rejects.toThrow(
      'Network error',
    )
  })

  it('should handle different HTTP error status codes', async () => {
    const testCases = [
      { status: 400, statusText: 'Bad Request' },
      { status: 401, statusText: 'Unauthorized' },
      { status: 403, statusText: 'Forbidden' },
      { status: 404, statusText: 'Not Found' },
      { status: 500, statusText: 'Internal Server Error' },
    ]

    for (const testCase of testCases) {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: testCase.status,
        statusText: testCase.statusText,
        json: async () => ({ error: testCase.statusText }),
      })

      try {
        await request('https://api.example.com/data')
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError)
        if (error instanceof HTTPError) {
          expect(error.status).toBe(testCase.status)
          expect(error.statusText).toBe(testCase.statusText)
        }
      }
    }
  })

  it('should handle empty response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => null,
    })

    const result = await request('https://api.example.com/data')

    expect(result).toBeNull()
  })

  it('should handle array responses', async () => {
    const mockData = [{ id: 1 }, { id: 2 }, { id: 3 }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await request('https://api.example.com/data')

    expect(result).toEqual(mockData)
  })
})
