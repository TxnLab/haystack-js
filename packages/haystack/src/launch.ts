/**
 * Helpers for pre-bonding HayLaunch token quotes
 * @internal
 */

import type { LaunchQuote, SwapLaunchQuote } from './types'

/**
 * Normalize a quote's raw launch object, coercing amounts to bigint and
 * defaulting the fields the API omits when they don't apply
 */
export function toSwapLaunchQuote(launch: LaunchQuote): SwapLaunchQuote {
  return {
    side: launch.side,
    tokenNum: launch.tokenNum,
    bondingTokenId: launch.bondingTokenId,
    bondingSurplus: BigInt(launch.bondingSurplus),
    refund: BigInt(launch.refund ?? 0),
    graduates: launch.graduates ?? false,
  }
}
