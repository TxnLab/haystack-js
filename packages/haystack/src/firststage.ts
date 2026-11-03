/**
 * Helpers for First Stage taxed token quotes
 * @internal
 */

import type { FirstStageQuote, SwapFirstStageQuote } from './types'

/**
 * Normalize a quote's raw First Stage object, coercing amounts to bigint
 */
export function toSwapFirstStageQuote(
  firstStage: FirstStageQuote,
): SwapFirstStageQuote {
  return {
    fromTax: BigInt(firstStage.fromTax),
    toTax: BigInt(firstStage.toTax),
    wrapped: [...(firstStage.wrapped ?? [])],
  }
}
