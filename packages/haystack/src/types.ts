import type { Protocol } from './constants'
import type {
  ABIArgument,
  ABIMethod,
  Address,
  BoxReference,
  OnApplicationComplete,
  ResourceReference,
  SuggestedParams,
  TransactionSigner,
} from 'algosdk'

/**
 * Configuration parameters for initializing RouterClient
 */
export interface ConfigParams {
  /** API key for Haystack Router API (required) */
  readonly apiKey: string

  /** Base URL for the Haystack Router API (default: https://hayrouter.txnlab.dev) */
  readonly apiBaseUrl?: string

  /** Algod node URI (default: https://mainnet-api.4160.nodely.dev/) */
  readonly algodUri?: string

  /** Algod node token (can be empty string for public nodes) */
  readonly algodToken?: string

  /** Algod node port (default: 443) */
  readonly algodPort?: string | number

  /** Referrer address for fee sharing (receives 25% of swap fees) */
  readonly referrerAddress?: string

  /** Fee in basis points (default: 15 = 0.15%, max: 300 = 3.00%) */
  readonly feeBps?: number

  /** Automatically detect and add required opt-in transactions (default: false) */
  readonly autoOptIn?: boolean

  /**
   * Debug logging level (default: 'none')
   *
   * - 'none': No debug logging (default)
   * - 'info': High-level operations (quote fetched, swap created, submitted)
   * - 'debug': Detailed flow (middleware applied, validation, status transitions)
   * - 'trace': Everything including request/response payloads, transaction details
   */
  readonly debugLevel?: 'none' | 'info' | 'debug' | 'trace'
}

/**
 * Internal configuration with all required fields validated
 *
 * @internal
 */
export type Config = Omit<
  Required<ConfigParams>,
  'referrerAddress' | 'debugLevel'
> & {
  readonly referrerAddress: string | undefined
  readonly debugLevel: 'none' | 'info' | 'debug' | 'trace'
}

/**
 * Swap quote type determining which amount is fixed
 */
export type QuoteType = 'fixed-input' | 'fixed-output'

/**
 * Parameters for requesting a swap quote from the Haystack Router API (raw API method)
 */
export interface FetchQuoteParams {
  /** Input asset ID */
  readonly fromASAID: bigint | number

  /** Output asset ID */
  readonly toASAID: bigint | number

  /** Amount to swap (in base units) */
  readonly amount: bigint | number

  /** Quote type (default: 'fixed-input') */
  readonly type?: QuoteType

  /** Protocols to exclude from routing (default: []) */
  readonly disabledProtocols?: readonly Protocol[]

  /** Maximum transaction group size (default: 16) */
  readonly maxGroupSize?: number

  /** Maximum depth of the route (default: 4) */
  readonly maxDepth?: number

  /** Whether to include asset opt-in transaction (overrides config.autoOptIn if set) */
  readonly optIn?: boolean

  /** Address of the account that will perform the swap (required if autoOptIn is enabled) */
  readonly address?: string | null

  /**
   * ⚠️ **ADVANCED USE ONLY - NON-COMPOSABLE SWAPS** ⚠️
   *
   * When set to `true`, removes the automatic exclusion of Tinyman v1 from routing,
   * allowing the API to route swaps through protocols that produce **non-composable**
   * transaction groups.
   *
   * **Critical Limitations:**
   * - You CANNOT add transactions before/after swap transactions in the atomic group
   * - Asset opt-ins and opt-outs MUST be sent in separate transaction groups
   * - The SwapComposer will throw errors if you attempt to compose additional transactions
   * - This parameter CANNOT be used with `optIn: true` or `config.autoOptIn: true`
   * - This parameter is NOT supported in `newQuote()` (only `fetchQuote()`)
   *
   * **When to use this:**
   * Only use this if you have built custom infrastructure to:
   * 1. Detect when the route uses non-composable protocols (Tinyman v1)
   * 2. Handle opt-in/opt-out transactions separately from the swap group
   * 3. Coordinate multiple transaction groups instead of composing a single atomic group
   *
   * **This breaks the standard SDK workflow.** The default behavior of always excluding
   * Tinyman v1 ensures all swaps are composable, which is the recommended approach.
   *
   * @default false
   * @internal This is not a supported public API feature
   */
  readonly _allowNonComposableSwaps?: boolean
}

/**
 * Asset information from the Haystack Router API
 */
export interface Asset {
  /** Asset ID */
  readonly id: number
  /** Number of decimal places */
  readonly decimals: number
  /** Unit name */
  readonly unit_name: string
  /** Full asset name */
  readonly name: string
  /** Price in ALGO */
  readonly price_algo: number
  /** Price in USD */
  readonly price_usd: number
}

/**
 * Profit information for a swap
 */
export interface Profit {
  /** Profit amount in base units */
  readonly amount: number
  /** The asset in which profit is denominated */
  readonly asa: Asset
}

/**
 * A single step in a swap route path
 */
export interface PathElement {
  /** Protocol name and fee tier */
  readonly name: string
  /** Protocol class identifier */
  readonly class: string[][]
  /** Input asset */
  readonly in: Asset
  /** Output asset */
  readonly out: Asset
}

/**
 * A route with its percentage of the total swap amount
 */
export interface Route {
  /** Percentage of total swap amount routed through this path */
  readonly percentage: number
  /** The sequence of swaps in this route */
  readonly path: PathElement[]
}

/**
 * Quote from a specific DEX protocol
 */
export interface DexQuote {
  /** Protocol name and fee tier */
  readonly name: string
  /** Protocol class */
  readonly class: string
  /** Quoted output value */
  readonly value: number
}

/**
 * Encrypted transaction payload from the quote
 */
export interface TxnPayload {
  /** Initialization vector for decryption */
  readonly iv: string
  /** Encrypted transaction data */
  readonly data: string
}

/**
 * Quote response from the Haystack Router API
 */
export interface FetchQuoteResponse {
  /** The quoted output amount or input amount (depending on quote type) */
  readonly quote: string | number
  /** Profit information for the swap */
  readonly profit: Profit
  /** Baseline price without fees */
  readonly priceBaseline: number
  /** Price impact for the user */
  readonly userPriceImpact?: number
  /** Overall market price impact */
  readonly marketPriceImpact?: number
  /** USD value of input amount */
  readonly usdIn: number
  /** USD value of output amount */
  readonly usdOut: number
  /** The routing path(s) for the swap */
  readonly route: Route[]
  /** Flattened view of routing percentages by protocol */
  readonly flattenedRoute: Record<string, number>
  /** Individual quotes from each DEX */
  readonly quotes: DexQuote[]
  /** App IDs that require opt-in for this swap */
  readonly requiredAppOptIns: number[]
  /** Encrypted transaction payload for generating swap transactions */
  readonly txnPayload: TxnPayload | null
  /** Fees charged by each protocol */
  readonly protocolFees: Record<string, number>
  /** Input asset ID */
  readonly fromASAID: number
  /** Output asset ID */
  readonly toASAID: number
  /** Quote type */
  readonly type: string
  /** Performance timing data */
  readonly timing?: unknown
}

/**
 * Enhanced quote result returned by RouterClient.newQuote()
 *
 * Extends the raw API response with additional metadata and type normalization.
 */
export type SwapQuote = Omit<FetchQuoteResponse, 'quote'> & {
  /**
   * The quoted output amount or input amount (coerced to bigint)
   *
   * For fixed-input swaps: This is the output amount you'll receive
   * For fixed-output swaps: This is the input amount you'll need to provide
   */
  readonly quote: bigint

  /** The original amount from the quote request (in base units) */
  readonly amount: bigint

  /** The address parameter from the quote request (if provided) */
  readonly address?: string

  /** Timestamp when the quote was created (in milliseconds) */
  readonly createdAt: number
}

/**
 * Transaction signature from the Haystack Router API
 */
export interface Signature {
  /** Signature type */
  readonly type: 'logic_signature' | 'secret_key'
  /** Signature data */
  readonly value: unknown
}

/**
 * Transaction data from the Haystack Router API
 */
export interface SwapTransaction {
  /** Base64-encoded transaction data */
  readonly data: string
  /** Group ID for the transaction */
  readonly group: string
  /** Logic signature blob (if applicable) */
  readonly logicSigBlob: unknown | false
  /** Signature data (false if user must sign) */
  readonly signature: Signature | false
}

/**
 * Parameters for fetching executable swap transactions
 */
export interface FetchSwapTxnsParams {
  /** Quote response from fetchQuote() or newQuote() */
  readonly quote: FetchQuoteResponse | SwapQuote

  /** Algorand address that will sign the transactions */
  readonly address: string

  /** Slippage tolerance as a percentage (e.g., 1 for 1%) */
  readonly slippage: number
}

/**
 * Request body for fetching swap transactions
 *
 * @internal
 */
export interface FetchSwapTxnsBody {
  /** API key for authentication */
  readonly apiKey: string
  /** Address of the account that will sign the transactions */
  readonly address: string
  /** Encrypted transaction payload from the quote */
  readonly txnPayloadJSON: TxnPayload | null
  /** Slippage tolerance as a percentage */
  readonly slippage: number
}

/**
 * Response from fetching swap transactions
 */
export interface FetchSwapTxnsResponse {
  /** Array of transaction data */
  readonly txns: SwapTransaction[]
}

/**
 * Summary of a swap transaction group after execution
 *
 * Contains the exact input/output amounts and total transaction fees.
 * Only available after calling execute() on a SwapComposer instance.
 */
export interface SwapSummary {
  /** Input asset ID (0 for ALGO) */
  inputAssetId: bigint
  /** Output asset ID (0 for ALGO) */
  outputAssetId: bigint
  /** Exact input amount in base units, from the user-signed transaction */
  inputAmount: bigint
  /** Exact output amount received in base units, from the inner transaction */
  outputAmount: bigint
  /** Quote type */
  type: QuoteType
  /** Total ALGO transaction fees in microAlgos */
  totalFees: bigint
  /** Number of transactions in the group */
  transactionCount: number
  /** Transaction ID of the user-signed input transaction (payment/asset transfer) */
  inputTxnId: string
  /** Transaction ID of the app call containing the output transfer as an inner transaction */
  outputTxnId: string
  /** Address that sent the input asset (the user) */
  inputSender: string
  /** Address that sent the output asset to the user */
  outputSender: string
}

/**
 * Method call to be executed as part of the swap
 */
export interface MethodCall {
  /** The ID of the smart contract to call. Set this to 0 to indicate an application creation call. */
  appID: number | bigint
  /** The method to call on the smart contract */
  method: ABIMethod
  /** The arguments to include in the method call. If omitted, no arguments will be passed to the method. */
  methodArgs?: ABIArgument[]
  /** The address of the sender of this application call */
  sender: string | Address
  /** Transactions params to use for this application call */
  suggestedParams: SuggestedParams
  /** The OnComplete action to take for this application call. If omitted, OnApplicationComplete.NoOpOC will be used. */
  onComplete?: OnApplicationComplete
  /** The approval program for this application call. Only set this if this is an application creation call, or if onComplete is OnApplicationComplete.UpdateApplicationOC */
  approvalProgram?: Uint8Array
  /** The clear program for this application call. Only set this if this is an application creation call, or if onComplete is OnApplicationComplete.UpdateApplicationOC */
  clearProgram?: Uint8Array
  /** The global integer schema size. Only set this if this is an application creation call. */
  numGlobalInts?: number
  /** The global byte slice schema size. Only set this if this is an application creation call. */
  numGlobalByteSlices?: number
  /** The local integer schema size. Only set this if this is an application creation call. */
  numLocalInts?: number
  /** The local byte slice schema size. Only set this if this is an application creation call. */
  numLocalByteSlices?: number
  /** The number of extra pages to allocate for the application's programs. Only set this if this is an application creation call. If omitted, defaults to 0. */
  extraPages?: number
  /** Array of Address strings that represent external accounts supplied to this application. If accounts are provided here, the accounts specified in the method args will appear after these. */
  appAccounts?: Array<string | Address>
  /** Array of App ID numbers that represent external apps supplied to this application. If apps are provided here, the apps specified in the method args will appear after these. */
  appForeignApps?: Array<number | bigint>
  /** Array of Asset ID numbers that represent external assets supplied to this application. If assets are provided here, the assets specified in the method args will appear after these. */
  appForeignAssets?: Array<number | bigint>
  /** The box references for this application call */
  boxes?: BoxReference[]
  /** The resource references for this application call */
  access?: ResourceReference[]
  /** The note value for this application call */
  note?: Uint8Array
  /** The lease value for this application call */
  lease?: Uint8Array
  /** If provided, the address that the sender will be rekeyed to at the conclusion of this application call */
  rekeyTo?: string | Address
  /** The lowest application version for which this transaction should immediately fail. 0 indicates that no version check should be performed. */
  rejectVersion?: number | bigint
  /** A transaction signer that can authorize this application call from sender */
  signer?: TransactionSigner
}
