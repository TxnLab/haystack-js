import { describe, it, expect } from 'vitest'
import {
  Protocol,
  DEPRECATED_PROTOCOLS,
  DEFAULT_ALGOD_URI,
  DEFAULT_ALGOD_TOKEN,
  DEFAULT_ALGOD_PORT,
  DEFAULT_API_BASE_URL,
  DEFAULT_FEE_BPS,
  MAX_FEE_BPS,
  DEFAULT_MAX_GROUP_SIZE,
  DEFAULT_MAX_DEPTH,
  DEFAULT_AUTO_OPT_IN,
  DEFAULT_CONFIRMATION_ROUNDS,
} from '../src/constants'

describe('constants', () => {
  describe('Protocol enum', () => {
    it('should have expected protocol values', () => {
      expect(Protocol.TinymanV2).toBe('TinymanV2')
      expect(Protocol.Algofi).toBe('Algofi')
      expect(Protocol.Algomint).toBe('Algomint')
      expect(Protocol.Pact).toBe('Pact')
      expect(Protocol.Folks).toBe('Folks')
      expect(Protocol.TAlgo).toBe('TAlgo')
    })

    it('should have exactly 6 protocols', () => {
      const protocols = Object.values(Protocol)
      expect(protocols).toHaveLength(6)
    })
  })

  describe('DEPRECATED_PROTOCOLS', () => {
    it('should include Humble and Tinyman', () => {
      expect(DEPRECATED_PROTOCOLS).toContain('Humble')
      expect(DEPRECATED_PROTOCOLS).toContain('Tinyman')
    })

    it('should have exactly 2 deprecated protocols', () => {
      expect(DEPRECATED_PROTOCOLS).toHaveLength(2)
    })

    it('should be a readonly array', () => {
      // TypeScript enforces readonly at compile time
      // At runtime, the array is still mutable in JavaScript
      expect(Array.isArray(DEPRECATED_PROTOCOLS)).toBe(true)
    })
  })

  describe('Algod configuration defaults', () => {
    it('should have correct default Algod URI', () => {
      expect(DEFAULT_ALGOD_URI).toBe('https://mainnet-api.4160.nodely.dev/')
    })

    it('should have empty default Algod token', () => {
      expect(DEFAULT_ALGOD_TOKEN).toBe('')
    })

    it('should have default Algod port 443', () => {
      expect(DEFAULT_ALGOD_PORT).toBe(443)
    })
  })

  describe('API configuration defaults', () => {
    it('should have correct default API base URL', () => {
      expect(DEFAULT_API_BASE_URL).toBe('https://hayrouter.txnlab.dev/api')
    })
  })

  describe('Fee configuration', () => {
    it('should have default fee of 10 basis points', () => {
      expect(DEFAULT_FEE_BPS).toBe(10)
    })

    it('should have maximum fee of 300 basis points', () => {
      expect(MAX_FEE_BPS).toBe(300)
    })

    it('should have valid fee range', () => {
      expect(DEFAULT_FEE_BPS).toBeLessThanOrEqual(MAX_FEE_BPS)
      expect(DEFAULT_FEE_BPS).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Transaction group configuration', () => {
    it('should have default max group size of 16', () => {
      expect(DEFAULT_MAX_GROUP_SIZE).toBe(16)
    })

    it('should have default max depth of 4', () => {
      expect(DEFAULT_MAX_DEPTH).toBe(4)
    })

    it('should have valid configuration values', () => {
      expect(DEFAULT_MAX_GROUP_SIZE).toBeGreaterThan(0)
      expect(DEFAULT_MAX_DEPTH).toBeGreaterThan(0)
    })
  })

  describe('Swap configuration', () => {
    it('should have auto opt-in disabled by default', () => {
      expect(DEFAULT_AUTO_OPT_IN).toBe(false)
    })
  })

  describe('Confirmation configuration', () => {
    it('should have default confirmation rounds of 10', () => {
      expect(DEFAULT_CONFIRMATION_ROUNDS).toBe(10)
    })

    it('should have positive confirmation rounds', () => {
      expect(DEFAULT_CONFIRMATION_ROUNDS).toBeGreaterThan(0)
    })
  })

  describe('Type checking', () => {
    it('should export number types for numeric constants', () => {
      expect(typeof DEFAULT_ALGOD_PORT).toBe('number')
      expect(typeof DEFAULT_FEE_BPS).toBe('number')
      expect(typeof MAX_FEE_BPS).toBe('number')
      expect(typeof DEFAULT_MAX_GROUP_SIZE).toBe('number')
      expect(typeof DEFAULT_MAX_DEPTH).toBe('number')
      expect(typeof DEFAULT_CONFIRMATION_ROUNDS).toBe('number')
    })

    it('should export string types for string constants', () => {
      expect(typeof DEFAULT_ALGOD_URI).toBe('string')
      expect(typeof DEFAULT_ALGOD_TOKEN).toBe('string')
      expect(typeof DEFAULT_API_BASE_URL).toBe('string')
    })

    it('should export boolean types for boolean constants', () => {
      expect(typeof DEFAULT_AUTO_OPT_IN).toBe('boolean')
    })
  })
})
