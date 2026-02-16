/**
 * Debug utilities for swap execution failures
 * @internal
 */

import { Logger } from './logger'
import type { SwapQuote, FetchQuoteResponse } from './types'

/**
 * Context for swap execution debugging
 */
export interface SwapExecutionContext {
  quote: SwapQuote | FetchQuoteResponse
  address: string
  slippage: number
  transactionCount: number
  middlewareCount: number
  groupSize: number
}

/**
 * Log detailed context when a swap execution fails
 * Only logs when debug level is enabled
 */
export function logSwapExecutionFailure(
  context: SwapExecutionContext,
  error: unknown,
): void {
  Logger.debug('Swap execution failed', {
    error: error instanceof Error ? error.message : String(error),
    quote: {
      fromASAID: context.quote.fromASAID,
      toASAID: context.quote.toASAID,
      type: context.quote.type,
      amount:
        'amount' in context.quote
          ? context.quote.amount.toString()
          : undefined,
      quote: context.quote.quote.toString(),
      requiredAppOptIns: context.quote.requiredAppOptIns,
      route: context.quote.route?.map((r) => ({
        percentage: r.percentage,
        path: r.path.map((p) => p.name).join(' → '),
      })),
    },
    swap: {
      address: context.address,
      slippage: context.slippage,
      transactionCount: context.transactionCount,
      middlewareCount: context.middlewareCount,
      groupSize: context.groupSize,
    },
  })
}
