/**
 * Internal logging utility for debug mode
 * @internal
 */

export enum LogLevel {
  NONE = 0,
  INFO = 1,
  DEBUG = 2,
  TRACE = 3,
}

export type LogLevelString = 'none' | 'info' | 'debug' | 'trace'

/**
 * Internal logger with level-based filtering and sanitization
 * @internal
 */
export class Logger {
  private static currentLevel: LogLevel = LogLevel.NONE

  /**
   * Set the current log level
   */
  static setLevel(level: LogLevelString): void {
    const levelMap: Record<LogLevelString, LogLevel> = {
      none: LogLevel.NONE,
      info: LogLevel.INFO,
      debug: LogLevel.DEBUG,
      trace: LogLevel.TRACE,
    }

    this.currentLevel = levelMap[level] ?? LogLevel.NONE
  }

  /**
   * Get the current log level
   */
  static getLevel(): LogLevel {
    return this.currentLevel
  }

  /**
   * Log info level message
   */
  static info(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.INFO)) return
    this.formatMessage('INFO', message, data)
  }

  /**
   * Log debug level message
   */
  static debug(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    this.formatMessage('DEBUG', message, data)
  }

  /**
   * Log trace level message
   */
  static trace(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.TRACE)) return
    this.formatMessage('TRACE', message, data)
  }

  /**
   * Check if a log level should be logged
   */
  private static shouldLog(level: LogLevel): boolean {
    return level <= this.currentLevel
  }

  /**
   * Sanitize data to remove sensitive fields
   */
  private static sanitize(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item))
    }

    if (typeof data === 'object') {
      try {
        const sanitized: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(data)) {
          // Redact sensitive fields
          if (key === 'apiKey' || key === 'algodToken') {
            sanitized[key] = '[REDACTED]'
            continue
          }

          // Sanitize signature values
          if (
            key === 'signature' &&
            typeof value === 'object' &&
            value !== null
          ) {
            const sig = value as Record<string, unknown>
            sanitized[key] = {
              type: sig.type,
              length:
                sig.value && typeof sig.value === 'object'
                  ? Object.keys(sig.value).length
                  : undefined,
            }
            continue
          }

          // Sanitize encrypted payload
          if (
            key === 'txnPayload' &&
            typeof value === 'object' &&
            value !== null
          ) {
            const payload = value as Record<string, unknown>
            sanitized[key] = {
              hasIv: !!payload.iv,
              hasData: !!payload.data,
              dataLength: payload.data
                ? Array.isArray(payload.data)
                  ? payload.data.length
                  : undefined
                : undefined,
            }
            continue
          }

          // Recursively sanitize nested objects
          sanitized[key] = this.sanitize(value)
        }

        return sanitized
      } catch {
        return '[Circular or non-serializable data]'
      }
    }

    return data
  }

  /**
   * Format and output log message
   */
  private static formatMessage(
    level: string,
    message: string,
    data?: unknown,
  ): void {
    if (level === 'INFO') {
      // Simple format for INFO
      if (data !== undefined) {
        console.log(`[INFO] ${message}`, this.sanitize(data))
      } else {
        console.log(`[INFO] ${message}`)
      }
    } else {
      // Detailed format with timestamp for DEBUG/TRACE
      const timestamp = new Date().toISOString()
      if (data !== undefined) {
        console.log(`[${level}] [${timestamp}] ${message}`, this.sanitize(data))
      } else {
        console.log(`[${level}] [${timestamp}] ${message}`)
      }
    }
  }
}
