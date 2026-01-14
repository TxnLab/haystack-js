import {
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  type Algodv2,
  type SuggestedParams,
  type TransactionSigner,
  type TransactionWithSigner,
} from 'algosdk'
import type { SwapQuote, FetchQuoteParams, QuoteType } from './types'

/**
 * Context provided to middleware shouldApply hook
 */
export interface QuoteContext {
  /** Input asset ID (always bigint for precision and future-proofing) */
  readonly fromASAID: bigint
  /** Output asset ID (always bigint for precision and future-proofing) */
  readonly toASAID: bigint
  /** Amount to swap (always bigint for precision and future-proofing) */
  readonly amount: bigint
  /** Quote type */
  readonly type: QuoteType
  /** Address of the account that will perform the swap (if provided) */
  readonly address?: string
  /** Algodv2 client instance for making additional queries */
  readonly algodClient: Algodv2
}

/**
 * Context provided to middleware hooks during swap composition
 */
export interface SwapContext {
  /** The quote result from newQuote() */
  readonly quote: SwapQuote
  /** The address of the account performing the swap */
  readonly address: string
  /** Algodv2 client instance for making additional queries/transactions */
  readonly algodClient: Algodv2
  /** Suggested transaction parameters from the network */
  readonly suggestedParams: SuggestedParams
  /** Input asset ID (always bigint for precision and future-proofing) */
  readonly fromASAID: bigint
  /** Output asset ID (always bigint for precision and future-proofing) */
  readonly toASAID: bigint
  /** Transaction signer for transactions that need to be signed by the user */
  readonly signer: TransactionSigner
}

/**
 * Middleware interface for extending Haystack Router swap functionality
 *
 * Middleware allows you to modify quote parameters and inject additional transactions
 * into the atomic swap group. This is useful for assets that require special handling,
 * such as those with transfer restrictions, taxes, or custom smart contract logic.
 *
 * @example
 * ```typescript
 * class CustomAssetMiddleware implements SwapMiddleware {
 *   readonly name = 'CustomAsset'
 *   readonly version = '1.0.0'
 *
 *   async shouldApply(context) {
 *     return context.fromASAID === CUSTOM_ASSET_ID || context.toASAID === CUSTOM_ASSET_ID
 *   }
 *
 *   async adjustQuoteParams(params) {
 *     // Reduce maxGroupSize to account for extra transactions
 *     return { ...params, maxGroupSize: params.maxGroupSize - 3 }
 *   }
 *
 *   async beforeSwap(context) {
 *     // Return transactions to add before the swap
 *     return [unfreezeTransaction]
 *   }
 *
 *   async afterSwap(context) {
 *     // Return transactions to add after the swap
 *     return [taxTransaction, refreezeTransaction]
 *   }
 * }
 * ```
 */
export interface SwapMiddleware {
  /** Unique identifier for the middleware */
  readonly name: string

  /** Semantic version of the middleware */
  readonly version: string

  /**
   * Determines if this middleware should be applied to the given swap
   *
   * Called during both quote and swap phases. Use this to check if either
   * the input or output asset requires special handling.
   *
   * @param context - Quote context with asset IDs, amount, type, address, and algod client
   * @returns True if middleware should be applied
   *
   * @example
   * ```typescript
   * async shouldApply(context) {
   *   // Check if asset is registered in our smart contract
   *   const assetInfo = await this.getAssetInfo(context.fromASAID)
   *   return assetInfo !== null
   * }
   * ```
   */
  shouldApply(context: QuoteContext): Promise<boolean>

  /**
   * Modify quote parameters before fetching the quote
   *
   * **IMPORTANT**: If your middleware adds transactions via `beforeSwap` or `afterSwap`,
   * you MUST reduce `maxGroupSize` accordingly to prevent failures. The Haystack Router API may
   * return routes that use all 16 available transaction slots.
   *
   * Use this to adjust the quote request based on your asset's requirements.
   * Common adjustments include:
   * - Reducing `maxGroupSize` to account for additional transactions (REQUIRED if adding txns)
   * - Adjusting `amount` to account for fees/taxes
   * - Modifying `disabledProtocols` if certain DEXs are incompatible
   *
   * @param params - Original quote parameters
   * @returns Modified quote parameters
   *
   * @example
   * ```typescript
   * async adjustQuoteParams(params) {
   *   const [fromTaxed, toTaxed] = await Promise.all([
   *     this.isAssetTaxed(params.fromASAID),
   *     this.isAssetTaxed(params.toASAID),
   *   ])
   *
   *   // 3 extra transactions per taxed asset
   *   let maxGroupSize = params.maxGroupSize ?? 16
   *   if (fromTaxed) maxGroupSize -= 3
   *   if (toTaxed) maxGroupSize -= 3
   *
   *   // Adjust amount for input tax
   *   let amount = params.amount
   *   if (fromTaxed) {
   *     const taxRate = await this.getTaxRate(params.fromASAID)
   *     amount = this.applyTax(amount, taxRate)
   *   }
   *
   *   return { ...params, maxGroupSize, amount }
   * }
   * ```
   */
  adjustQuoteParams?(params: FetchQuoteParams): Promise<FetchQuoteParams>

  /**
   * Add transactions before the swap transactions
   *
   * Called when building the swap transaction group. Transactions are added
   * to the group in the order they appear in the returned array.
   *
   * Transaction order in final group: [beforeSwap] → [swap txns] → [afterSwap]
   *
   * @param context - Swap context with quote, address, and algod client
   * @returns Array of transactions with signers to add before swap
   *
   * @example
   * ```typescript
   * async beforeSwap(context) {
   *   const txns: TransactionWithSigner[] = []
   *
   *   // Unfreeze user account before swap
   *   if (await this.needsUnfreeze(context.fromASAID)) {
   *     const unfreezeCall = makeApplicationNoOpTxn(
   *       context.address,
   *       this.appId,
   *       ...,
   *       context.suggestedParams
   *     )
   *
   *     txns.push({
   *       txn: unfreezeCall,
   *       signer: context.signer, // Use the signer from context
   *     })
   *   }
   *
   *   return txns
   * }
   * ```
   */
  beforeSwap?(context: SwapContext): Promise<TransactionWithSigner[]>

  /**
   * Add transactions after the swap transactions
   *
   * Called when building the swap transaction group. Transactions are added
   * to the group in the order they appear in the returned array.
   *
   * Transaction order in final group: [beforeSwap] → [swap txns] → [afterSwap]
   *
   * @param context - Swap context with quote, address, and algod client
   * @returns Array of transactions with signers to add after swap
   *
   * @example
   * ```typescript
   * async afterSwap(context) {
   *   const txns: TransactionWithSigner[] = []
   *
   *   // Pay tax and refreeze account
   *   if (await this.isTaxed(context.fromASAID)) {
   *     const taxAmount = await this.calculateTax(context)
   *     const taxPayment = makeAssetTransferTxn(
   *       context.address,
   *       this.taxReceiver,
   *       taxAmount,
   *       context.fromASAID,
   *       context.suggestedParams
   *     )
   *     const refreezeCall = makeApplicationNoOpTxn(
   *       context.address,
   *       this.appId,
   *       ...,
   *       context.suggestedParams
   *     )
   *
   *     txns.push(
   *       { txn: taxPayment, signer: context.signer },
   *       { txn: refreezeCall, signer: context.signer },
   *     )
   *   }
   *
   *   return txns
   * }
   * ```
   */
  afterSwap?(context: SwapContext): Promise<TransactionWithSigner[]>
}

/**
 * Configuration options for AutoOptOutMiddleware
 */
export interface AutoOptOutConfig {
  /**
   * Array of asset IDs that should be excluded from automatic opt-out behavior
   * @default []
   */
  readonly excludedAssets?: readonly (number | bigint)[]
}

/**
 * Middleware that automatically adds an asset opt-out transaction when swapping
 * the full balance of an input asset, leaving it with a zero balance.
 *
 * @example
 * ```typescript
 * import { RouterClient, AutoOptOutMiddleware } from '@txnlab/haystack-router'
 *
 * const autoOptOut = new AutoOptOutMiddleware({
 *   excludedAssets: [31566704], // Don't auto-opt-out of USDC
 * })
 *
 * const router = new RouterClient({
 *   apiKey: 'your-api-key',
 *   middleware: [autoOptOut],
 * })
 *
 * // When swapping full balance, opt-out transaction is automatically added
 * const quote = await router.newQuote({
 *   address: userAddress,
 *   fromASAID: someAssetId,
 *   toASAID: 0,
 *   amount: fullBalance, // If this equals account's full balance, opt-out is added
 *   type: 'fixed-input',
 * })
 * ```
 */
export class AutoOptOutMiddleware implements SwapMiddleware {
  readonly name = 'AutoOptOut'
  readonly version = '1.0.0'

  private readonly excludedAssets: Set<bigint>

  constructor(config: AutoOptOutConfig = {}) {
    this.excludedAssets = new Set(
      (config.excludedAssets ?? []).map((id) => BigInt(id)),
    )
  }

  async shouldApply(context: QuoteContext): Promise<boolean> {
    // Only apply for fixed-input swaps
    if (context.type !== 'fixed-input') {
      return false
    }

    // Must have an address to check balance
    if (!context.address) {
      return false
    }

    // Don't opt-out of ALGO (asset ID 0)
    if (context.fromASAID === 0n) {
      return false
    }

    // Check if asset is in excluded list
    if (this.excludedAssets.has(context.fromASAID)) {
      return false
    }

    try {
      // Get account info to check current balance
      const accountInfo = await context.algodClient
        .accountInformation(context.address)
        .do()

      // Find the asset in account's holdings
      const assetHolding = accountInfo.assets?.find(
        (asset) => asset.assetId === context.fromASAID,
      )

      // If asset not found, don't opt-out
      if (!assetHolding) {
        return false
      }

      // Check if swap amount equals current balance
      return assetHolding.amount === context.amount
    } catch (error) {
      // If we can't fetch account info, don't apply middleware
      console.warn(
        `AutoOptOutMiddleware: Failed to fetch account info for ${context.address}:`,
        error,
      )
      return false
    }
  }

  async adjustQuoteParams(params: FetchQuoteParams): Promise<FetchQuoteParams> {
    // Reduce maxGroupSize by 1 to make room for the opt-out transaction
    const maxGroupSize = (params.maxGroupSize ?? 16) - 1

    return {
      ...params,
      maxGroupSize,
    }
  }

  async afterSwap(context: SwapContext): Promise<TransactionWithSigner[]> {
    // Create asset opt-out transaction (send 0 amount with closeRemainderTo = sender)
    const optOutTxn = makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: context.address,
      receiver: context.address,
      amount: 0n,
      assetIndex: context.fromASAID,
      closeRemainderTo: context.address,
      suggestedParams: context.suggestedParams,
    })

    return [
      {
        txn: optOutTxn,
        signer: context.signer,
      },
    ]
  }
}
