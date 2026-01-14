import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger, LogLevel } from '../src/logger'

describe('Logger', () => {
  // Mock console methods
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Reset to default level
    Logger.setLevel('none')
  })

  describe('Log level configuration', () => {
    it('should default to NONE level', () => {
      expect(Logger.getLevel()).toBe(LogLevel.NONE)
    })

    it('should set INFO level', () => {
      Logger.setLevel('info')
      expect(Logger.getLevel()).toBe(LogLevel.INFO)
    })

    it('should set DEBUG level', () => {
      Logger.setLevel('debug')
      expect(Logger.getLevel()).toBe(LogLevel.DEBUG)
    })

    it('should set TRACE level', () => {
      Logger.setLevel('trace')
      expect(Logger.getLevel()).toBe(LogLevel.TRACE)
    })

    it('should handle invalid level by defaulting to NONE', () => {
      Logger.setLevel('invalid' as any)
      expect(Logger.getLevel()).toBe(LogLevel.NONE)
    })
  })

  describe('Log level filtering', () => {
    it('should not log anything when level is NONE', () => {
      Logger.setLevel('none')

      Logger.info('test')
      Logger.debug('test')
      Logger.trace('test')

      expect(console.log).not.toHaveBeenCalled()
    })

    it('should only log INFO when level is INFO', () => {
      Logger.setLevel('info')

      Logger.info('info message')
      Logger.debug('debug message')
      Logger.trace('trace message')

      expect(console.log).toHaveBeenCalledTimes(1)
      expect(console.log).toHaveBeenCalledWith('[INFO] info message')
    })

    it('should log INFO and DEBUG when level is DEBUG', () => {
      Logger.setLevel('debug')

      Logger.info('info message')
      Logger.debug('debug message')
      Logger.trace('trace message')

      expect(console.log).toHaveBeenCalledTimes(2)
      expect(console.log).toHaveBeenCalledWith('[INFO] info message')
      // DEBUG/TRACE messages are formatted with timestamp as a single string
      const calls = (console.log as any).mock.calls
      expect(calls[1][0]).toContain('[DEBUG]')
      expect(calls[1][0]).toContain('debug message')
    })

    it('should log all levels when level is TRACE', () => {
      Logger.setLevel('trace')

      Logger.info('info message')
      Logger.debug('debug message')
      Logger.trace('trace message')

      expect(console.log).toHaveBeenCalledTimes(3)
    })
  })

  describe('Message formatting', () => {
    it('should format INFO messages without timestamp', () => {
      Logger.setLevel('info')

      Logger.info('test message')

      expect(console.log).toHaveBeenCalledWith('[INFO] test message')
    })

    it('should format DEBUG messages with timestamp', () => {
      Logger.setLevel('debug')

      Logger.debug('test message')

      const calls = (console.log as any).mock.calls
      expect(calls[0][0]).toMatch(
        /^\[DEBUG\] \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] test message$/,
      )
    })

    it('should format TRACE messages with timestamp', () => {
      Logger.setLevel('trace')

      Logger.trace('test message')

      const calls = (console.log as any).mock.calls
      expect(calls[0][0]).toMatch(
        /^\[TRACE\] \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] test message$/,
      )
    })

    it('should include data in INFO messages', () => {
      Logger.setLevel('info')

      Logger.info('test', { key: 'value' })

      expect(console.log).toHaveBeenCalledWith('[INFO] test', { key: 'value' })
    })

    it('should include data in DEBUG messages', () => {
      Logger.setLevel('debug')

      Logger.debug('test', { key: 'value' })

      const calls = (console.log as any).mock.calls
      expect(calls[0][0]).toContain('[DEBUG]')
      expect(calls[0][0]).toContain('test')
      expect(calls[0][1]).toEqual({ key: 'value' })
    })
  })

  describe('Data sanitization', () => {
    it('should redact apiKey field', () => {
      Logger.setLevel('info')

      Logger.info('test', { apiKey: 'secret-key', other: 'visible' })

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toEqual({ apiKey: '[REDACTED]', other: 'visible' })
    })

    it('should redact algodToken field', () => {
      Logger.setLevel('info')

      Logger.info('test', { algodToken: 'secret-token', other: 'visible' })

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toEqual({
        algodToken: '[REDACTED]',
        other: 'visible',
      })
    })

    it('should sanitize signature values', () => {
      Logger.setLevel('info')

      const signature = {
        type: 'logic_signature',
        value: { data: 'secret' },
      }

      Logger.info('test', { signature })

      const calls = (console.log as any).mock.calls
      expect(calls[0][1].signature).toEqual({
        type: 'logic_signature',
        length: 1,
      })
    })

    it('should sanitize txnPayload', () => {
      Logger.setLevel('info')

      const txnPayload = {
        iv: 'initialization-vector',
        data: [1, 2, 3, 4, 5],
      }

      Logger.info('test', { txnPayload })

      const calls = (console.log as any).mock.calls
      expect(calls[0][1].txnPayload).toEqual({
        hasIv: true,
        hasData: true,
        dataLength: 5,
      })
    })

    it('should sanitize nested objects', () => {
      Logger.setLevel('info')

      const data = {
        config: {
          apiKey: 'secret',
          algodToken: 'token',
        },
        other: 'visible',
      }

      Logger.info('test', data)

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toEqual({
        config: {
          apiKey: '[REDACTED]',
          algodToken: '[REDACTED]',
        },
        other: 'visible',
      })
    })

    it('should handle arrays', () => {
      Logger.setLevel('info')

      const data = [{ apiKey: 'secret1' }, { apiKey: 'secret2' }]

      Logger.info('test', data)

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toEqual([
        { apiKey: '[REDACTED]' },
        { apiKey: '[REDACTED]' },
      ])
    })

    it('should handle null and undefined', () => {
      Logger.setLevel('info')

      Logger.info('test null', null)
      Logger.info('test undefined', undefined)

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toBe(null)
      expect(calls[1][1]).toBe(undefined)
    })

    it('should handle primitive values', () => {
      Logger.setLevel('info')

      Logger.info('string', 'test')
      Logger.info('number', 42)
      Logger.info('boolean', true)

      const calls = (console.log as any).mock.calls
      expect(calls[0][1]).toBe('test')
      expect(calls[1][1]).toBe(42)
      expect(calls[2][1]).toBe(true)
    })
  })

  describe('Performance', () => {
    it('should not sanitize data when logging is disabled', () => {
      Logger.setLevel('none')

      // Should not throw or process anything
      const heavyData = {
        apiKey: 'secret',
        nested: { deep: { data: 'value' } },
      }
      Logger.info('test', heavyData)

      expect(console.log).not.toHaveBeenCalled()
    })

    it('should not call formatMessage when level is disabled', () => {
      Logger.setLevel('info')

      // These should not be logged
      Logger.debug('debug message')
      Logger.trace('trace message')

      expect(console.log).not.toHaveBeenCalled()
    })
  })

  describe('Runtime level changes', () => {
    it('should respect level changes during execution', () => {
      Logger.setLevel('none')
      Logger.info('should not log')
      expect(console.log).not.toHaveBeenCalled()

      Logger.setLevel('info')
      Logger.info('should log')
      expect(console.log).toHaveBeenCalledTimes(1)

      Logger.setLevel('none')
      Logger.info('should not log again')
      expect(console.log).toHaveBeenCalledTimes(1)
    })
  })
})
