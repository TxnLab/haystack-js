import { Algodv2, isValidAddress, type TransactionSigner } from 'algosdk'
import { SwapComposer, type SignerFunction } from './composer'
import {
  DEFAULT_ALGOD_PORT,
  DEFAULT_ALGOD_TOKEN,
  DEFAULT_ALGOD_URI,
  DEFAULT_API_BASE_URL,
  DEFAULT_AUTO_OPT_IN,
  DEFAULT_DEBUG_LEVEL,
  DEFAULT_FEE_BPS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_GROUP_SIZE,
  DEPRECATED_PROTOCOLS,
  MAX_FEE_BPS,
} from './constants'
import { Logger } from './logger'
import { request } from './utils'
import type { SwapMiddleware } from './middleware'
import type {
  FetchQuoteResponse,
  FetchSwapTxnsResponse,
  Config,
  ConfigParams,
  FetchSwapTxnsParams,
  FetchSwapTxnsBody,
  FetchQuoteParams,
  SwapQuote,
} from './types'

/**
 * Client for interacting with the Haystack order router API
 *
 * The RouterClient provides methods to fetch swap quotes and create transaction composers
 * for executing swaps on the Algorand blockchain. It handles API communication, transaction
 * validation, and automatic asset/app opt-in detection.
 *
 * @example
 * ```typescript
 * const router = new RouterClient({
 *   apiKey: '1b72df7e-1131-4449-8ce1-29b79dd3f51e', // Free tier (60 requests/min)
 * })
 * ```
 *
 * @example
 * ```typescript
 * const router = new RouterClient({
 *   apiKey: '1b72df7e-1131-4449-8ce1-29b79dd3f51e', // Free tier (60 requests/min)
 *   apiBaseUrl: 'https://hayrouter.txnlab.dev',
 *   algodUri: 'https://mainnet-api.4160.nodely.dev/',
 *   algodToken: '',
 *   algodPort: 443,
 *   referrerAddress: 'REFERRER_ADDRESS...',
 *   feeBps: 15,
 *   autoOptIn: false,
 * })
 * ```
 */
export class RouterClient {
  private readonly config: Config
  private readonly algodClient: Algodv2
  private readonly middleware: SwapMiddleware[]

  /**
   * Create a new RouterClient instance
   *
   * @param config - Configuration parameters
   * @param config.apiKey - API key for Haystack Router API (required)
   * @param config.apiBaseUrl - Base URL for the Haystack Router API (default: https://hayrouter.txnlab.dev)
   * @param config.algodUri - Algod node URI (default: https://mainnet-api.4160.nodely.dev/)
   * @param config.algodToken - Algod node token (default: '')
   * @param config.algodPort - Algod node port (default: 443)
   * @param config.referrerAddress - Referrer address for fee sharing (receives 25% of swap fees)
   * @param config.feeBps - Fee in basis points (default: 15 = 0.15%, max: 300 = 3.00%)
   * @param config.autoOptIn - Automatically detect and add required opt-in transactions (default: false)
   * @param config.debugLevel - Debug logging level (default: 'none')
   * @param config.middleware - Array of middleware to apply to swaps (default: [])
   */
  constructor(config: ConfigParams & { middleware?: SwapMiddleware[] }) {
    // Set logger level FIRST (before any operations)
    const debugLevel = config.debugLevel ?? DEFAULT_DEBUG_LEVEL
    Logger.setLevel(debugLevel)

    // Validate and set config
    this.config = {
      apiKey: this.validateApiKey(config.apiKey),
      apiBaseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      algodUri: config.algodUri ?? DEFAULT_ALGOD_URI,
      algodToken: config.algodToken ?? DEFAULT_ALGOD_TOKEN,
      algodPort: config.algodPort ?? DEFAULT_ALGOD_PORT,
      referrerAddress: config.referrerAddress
        ? this.validateAddress(config.referrerAddress)
        : undefined,
      feeBps: this.validateFeeBps(config.feeBps ?? DEFAULT_FEE_BPS),
      autoOptIn: config.autoOptIn ?? DEFAULT_AUTO_OPT_IN,
      debugLevel,
    }

    // Create Algodv2 client
    this.algodClient = new Algodv2(
      this.config.algodToken,
      this.config.algodUri,
      this.config.algodPort,
    )

    // Store middleware
    this.middleware = config.middleware ?? []
  }

  /**
   * Fetch a swap quote from the Haystack Router API
   *
   * Requests optimal swap routing from the Haystack Router API. The quote includes routing
   * information, price impact, required opt-ins, and an encrypted transaction payload.
   *
   * @param params - Parameters for the quote request
   * @param params.fromASAID - The ID of the asset to swap from
   * @param params.toASAID - The ID of the asset to swap to
   * @param params.amount - The amount of the asset to swap in base units
   * @param params.type - The type of the quote (default: 'fixed-input')
   * @param params.disabledProtocols - List of protocols to disable (default: [])
   * @param params.maxGroupSize - The maximum group size (default: 16)
   * @param params.maxDepth - The maximum depth (default: 4)
   * @param params.address - The address of the account that will perform the swap (recommended when using `config.autoOptIn` or `params.optIn`)
   * @param params.optIn - Whether to include asset opt-in transaction
   *   - If true: API reduces maxGroupSize by 1 and includes opt-in (always included, even if not needed)
   *   - If false: No opt-in transaction included
   *   - If undefined: Falls back to `config.autoOptIn` behavior with account check (if `params.address` is provided)
   * @returns A FetchQuoteResponse object with routing information
   *
   * @example
   * ```typescript
   * const quote = await router.fetchQuote({
   *   address: 'ABC...',
   *   fromASAID: 0,           // ALGO
   *   toASAID: 31566704,      // USDC
   *   amount: 1_000_000,      // 1 ALGO
   * })
   * ```
   */
  async fetchQuote(params: FetchQuoteParams): Promise<FetchQuoteResponse> {
    const {
      fromASAID,
      toASAID,
      amount,
      type = 'fixed-input',
      disabledProtocols = [],
      maxGroupSize = DEFAULT_MAX_GROUP_SIZE,
      maxDepth = DEFAULT_MAX_DEPTH,
      optIn,
      address,
      _allowNonComposableSwaps = false,
    } = params

    // Validate incompatible parameter combinations
    if (_allowNonComposableSwaps && (optIn === true || this.config.autoOptIn)) {
      throw new Error(
        'Cannot use _allowNonComposableSwaps with optIn or autoOptIn. ' +
          'When allowing non-composable swaps (Tinyman v1), you must handle ' +
          'asset opt-ins and opt-outs in separate transaction groups.',
      )
    }

    // Conditionally include deprecated protocols in disabled list
    // If _allowNonComposableSwaps is true, only exclude Tinyman v1 from auto-disabled list
    // Otherwise, always include all deprecated protocols (Tinyman v1, Humble)
    const allDisabledProtocols = _allowNonComposableSwaps
      ? [...new Set(['Humble', ...disabledProtocols])]
      : [...new Set([...DEPRECATED_PROTOCOLS, ...disabledProtocols])]

    let includeOptIn = optIn
    if (includeOptIn === undefined && this.config.autoOptIn) {
      if (address) {
        includeOptIn = await this.needsAssetOptIn(
          this.validateAddress(address),
          toASAID,
        )
      } else {
        console.warn(
          'autoOptIn is enabled but no address provided to fetchQuote(). Asset opt-in check skipped.',
        )
      }
    }

    const url = new URL(`${this.config.apiBaseUrl}/fetchQuote`)

    url.searchParams.append('apiKey', this.config.apiKey)
    url.searchParams.append('algodUri', this.config.algodUri)
    url.searchParams.append('algodToken', this.config.algodToken)
    url.searchParams.append('algodPort', String(this.config.algodPort))
    url.searchParams.append('feeBps', this.config.feeBps.toString())
    url.searchParams.append('fromASAID', BigInt(fromASAID).toString())
    url.searchParams.append('toASAID', BigInt(toASAID).toString())
    url.searchParams.append('amount', BigInt(amount).toString())
    url.searchParams.append('type', type)
    url.searchParams.append('disabledProtocols', allDisabledProtocols.join(','))
    url.searchParams.append('maxGroupSize', maxGroupSize.toString())
    url.searchParams.append('maxDepth', maxDepth.toString())

    if (typeof includeOptIn === 'boolean') {
      url.searchParams.append('optIn', String(includeOptIn))
    }

    if (this.config.referrerAddress) {
      url.searchParams.append('referrerAddress', this.config.referrerAddress)
    }

    return request<FetchQuoteResponse>(url.toString())
  }

  /**
   * Check if asset opt-in is required for the output asset
   *
   * Convenience method to determine if an address needs to opt into the output asset
   * of a swap. This is useful when you want to get a quote without requiring wallet
   * connection upfront, but need to know whether to set `optIn: true` in fetchQuote()
   * to ensure proper routing (as opt-ins reduce maxGroupSize by 1).
   *
   * Note: If you enable `config.autoOptIn`, this check is handled automatically when
   * an address is provided to fetchQuote().
   *
   * @param address - The address to check
   * @param assetId - The output asset ID to check
   * @returns True if asset opt-in is required, false otherwise (always false for ALGO)
   *
   * @example
   * ```typescript
   * // Check if opt-in needed for output asset before fetching quote
   * const needsOptIn = await router.needsAssetOptIn(userAddress, toAssetId)
   * const quote = await router.fetchQuote({
   *   fromAssetId,
   *   toAssetId,
   *   amount,
   *   optIn: needsOptIn,
   * })
   * ```
   */
  async needsAssetOptIn(
    address: string,
    assetId: number | bigint,
  ): Promise<boolean> {
    // Fetch account information
    const accountInfo = await this.algodClient.accountInformation(address).do()

    // Check if asset opt-in is required
    return (
      BigInt(assetId) !== 0n &&
      accountInfo?.assets?.find(
        (asset) => asset.assetId === BigInt(assetId),
      ) === undefined
    )
  }

  /**
   * Fetch swap transactions from the Haystack Router API
   *
   * Decrypts the quote payload and generates executable swap transactions for the
   * specified signer address with the given slippage tolerance.
   *
   * @param params - Parameters for the swap transaction request
   * @param params.quote - The quote response from fetchQuote()
   * @param params.address - The address of the signer
   * @param params.slippage - The slippage tolerance as a percentage (e.g., 1 for 1%)
   * @returns A FetchSwapTxnsResponse object with transaction data
   */
  async fetchSwapTransactions(
    params: FetchSwapTxnsParams,
  ): Promise<FetchSwapTxnsResponse> {
    const { quote, address, slippage } = params

    // Validate signer address
    this.validateAddress(address)

    const url = new URL(`${this.config.apiBaseUrl}/fetchExecuteSwapTxns`)

    const body: FetchSwapTxnsBody = {
      apiKey: this.config.apiKey,
      address,
      txnPayloadJSON: quote.txnPayload,
      slippage,
    }

    return request<FetchSwapTxnsResponse>(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  /**
   * Fetch a quote and return an enhanced quote result
   *
   * This is the recommended way to fetch quotes. It returns an object that
   * extends the raw API response with additional metadata and type normalization.
   *
   * @param params - Parameters for the quote request
   * @param params.fromASAID - The ID of the asset to swap from
   * @param params.toASAID - The ID of the asset to swap to
   * @param params.amount - The amount of the asset to swap in base units
   * @param params.type - The type of the quote (default: 'fixed-input')
   * @param params.disabledProtocols - List of protocols to disable (default: [])
   * @param params.maxGroupSize - The maximum group size (default: 16)
   * @param params.maxDepth - The maximum depth (default: 4)
   * @param params.address - The address of the account that will perform the swap (recommended when using `config.autoOptIn` or `params.optIn`)
   * @param params.optIn - Whether to include asset opt-in transaction
   * @returns A SwapQuote enhanced quote result
   *
   * @example
   * ```typescript
   * const quote = await router.newQuote({
   *   address: 'ABC...',
   *   fromASAID: 0,
   *   toASAID: 31566704,
   *   amount: 1_000_000,
   * })
   *
   * console.log(quote.quote)     // bigint - quoted amount
   * console.log(quote.fromASAID) // number - input asset ID
   * console.log(quote.toASAID)   // number - output asset ID
   * console.log(quote.amount)    // bigint - original request amount
   * console.log(quote.createdAt) // number - timestamp
   * ```
   */
  async newQuote(params: FetchQuoteParams): Promise<SwapQuote> {
    // Block usage of _allowNonComposableSwaps with newQuote (middleware path)
    if (params._allowNonComposableSwaps) {
      throw new Error(
        'The _allowNonComposableSwaps parameter is not supported with newQuote(). ' +
          'This parameter is only available with fetchQuote() for advanced use cases. ' +
          'The newQuote() method is designed for composable swaps with middleware support.',
      )
    }

    // Apply middleware transformations to quote params
    let adjustedParams = { ...params }

    // Create quote context for middleware
    const quoteContext = {
      fromASAID: BigInt(params.fromASAID),
      toASAID: BigInt(params.toASAID),
      amount: BigInt(params.amount),
      type: params.type ?? ('fixed-input' as const),
      address: params.address ?? undefined,
      algodClient: this.algodClient,
    }

    for (const mw of this.middleware) {
      const shouldApply = await mw.shouldApply(quoteContext)

      if (shouldApply && mw.adjustQuoteParams) {
        adjustedParams = await mw.adjustQuoteParams(adjustedParams)
      }
    }

    const response = await this.fetchQuote(adjustedParams)

    return {
      ...response,
      quote: response.quote === '' ? 0n : BigInt(response.quote),
      amount: BigInt(params.amount),
      address: params.address ?? undefined,
      createdAt: Date.now(),
    }
  }

  /**
   * Create a SwapComposer instance
   *
   * This factory method creates a composer that allows you to add custom transactions
   * before and after the swap transactions, with automatic handling of pre-signed transactions
   * and opt-ins.
   *
   * @param config.quote - The quote result from newQuote() or raw API response from fetchQuote()
   * @param config.address - The address of the signer
   * @param config.slippage - The slippage tolerance
   * @param config.signer - Transaction signer function
   * @returns A SwapComposer instance ready for building transaction groups
   *
   * @example
   * ```typescript
   * // Basic swap
   * const quote = await router.newQuote({ ... })
   * await router.newSwap({ quote, address, slippage, signer })
   *   .execute()
   * ```
   *
   * @example
   * ```typescript
   * // Advanced swap with custom transactions
   * const quote = await router.newQuote({ ... })
   * const swap = await router.newSwap({
   *   quote,
   *   address,
   *   slippage,
   *   signer,
   * })
   *
   * console.log(swap.getStatus()) // BUILDING
   *
   * const signedTxns = await swap
   *   .addTransaction(beforeTxn)
   *   .addSwapTransactions() // Adds swap transactions to the group
   *   .addTransaction(afterTxn)
   *   .sign()
   *
   * console.log(swap.getStatus()) // SIGNED
   *
   * const result = await swap.execute(waitRounds)
   * console.log(result.confirmedRound, result.txIds)
   *
   * console.log(swap.getStatus()) // COMMITTED
   * ```
   */
  async newSwap(config: {
    quote: SwapQuote | FetchQuoteResponse
    address: string
    slippage: number
    signer: TransactionSigner | SignerFunction
    /** Optional note field for the user-signed input transaction (payment or asset transfer) */
    note?: Uint8Array
  }): Promise<SwapComposer> {
    const { quote, address, slippage, signer, note } = config

    const swapResponse = await this.fetchSwapTransactions({
      quote,
      address,
      slippage,
    })

    // Create the composer
    const composer = new SwapComposer({
      quote,
      swapTxns: swapResponse.txns,
      algodClient: this.algodClient,
      address,
      signer,
      middleware: this.middleware,
      note,
      debugLevel: this.config.debugLevel,
    })

    return composer
  }

  /**
   * Validates the API key
   */
  private validateApiKey(apiKey: string): string {
    if (!apiKey) {
      throw new Error('API key is required')
    }
    return apiKey
  }

  /**
   * Validates an Algorand address
   */
  private validateAddress(address: string): string {
    if (!isValidAddress(address)) {
      throw new Error(`Invalid Algorand address: ${address}`)
    }
    return address
  }

  /**
   * Validates the fee in basis points (max 300 = 3.00%)
   */
  private validateFeeBps(feeBps: number): number {
    if (feeBps < 0 || feeBps > MAX_FEE_BPS) {
      throw new Error(
        `Invalid fee: ${feeBps} basis points (must be between 0 and ${MAX_FEE_BPS})`,
      )
    }
    return feeBps
  }
}
