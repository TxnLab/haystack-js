import {
  AtomicTransactionComposer,
  decodeUint64,
  decodeUnsignedTransaction,
  encodeAddress,
  getApplicationAddress,
  isValidAddress,
  LogicSigAccount,
  makeApplicationOptInTxnFromObject,
  msgpackRawDecode,
  signLogicSigTransactionObject,
  signTransaction,
  Transaction,
  TransactionType,
  type ABIResult,
  type Algodv2,
  type TransactionSigner,
  type TransactionWithSigner,
} from 'algosdk'
import { DEFAULT_CONFIRMATION_ROUNDS } from './constants'
import { toSwapLaunchQuote } from './launch'
import { Logger } from './logger'
import type { SwapMiddleware, SwapContext, QuoteContext } from './middleware'
import type {
  FetchQuoteResponse,
  SwapTransaction,
  Signature,
  SwapQuote,
  MethodCall,
  QuoteType,
  SwapSummary,
} from './types'

/** ABI selectors of the HayLaunch bonding-curve buy methods (buyWithLimit, buyWithAlgoWithLimit) */
const LAUNCH_BUY_SELECTORS = new Set(['9068a8d9', 'b0e30517'])

/** ABI selector of the HayLaunch bonding-curve sell method (sellWithLimit) */
const LAUNCH_SELL_SELECTOR = '028a0647'

/** Prefix of the log that carries an ARC-4 method's return value */
const ARC4_RETURN_PREFIX = '151f7c75'

/**
 * Selector of ORDER_ROUTER v4's ARC-28 Swap event: the first 4 bytes of the
 * SHA-512/256 of
 * Swap(uint64,uint64,uint8,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,address,address)
 * (assetIn, assetOut, type, amount, amountIn, outDelta, delivered,
 * refundSwapped, refunded, algoReturned, treasuryFee, referrerFee, sender,
 * beneficiary, referrer)
 */
const SWAP_EVENT_SELECTOR = '6d221c27'

/** Byte length of a Swap event log: the selector, 11 uint64s, a uint8 and 3 addresses */
const SWAP_EVENT_LENGTH = 4 + 11 * 8 + 1 + 3 * 32

/** A swap transaction from the API, decoded */
interface DecodedSwapTransaction {
  txn: Transaction
  signature: Signature | false
}

/**
 * Returns which side of a HayLaunch bonding-curve trade an app call is, or
 * undefined if it isn't a curve buy or sell call
 */
function launchCurveSide(txn: Transaction): 'buy' | 'sell' | undefined {
  const selector = txn.applicationCall?.appArgs[0]
  if (txn.type !== TransactionType.appl || !selector) return undefined

  const hex = Buffer.from(selector).toString('hex')
  if (LAUNCH_BUY_SELECTORS.has(hex)) return 'buy'
  if (hex === LAUNCH_SELL_SELECTOR) return 'sell'
  return undefined
}

/**
 * Reads a uint64 ARC-4 return value from an app call's logs (the last log,
 * prefixed with 151f7c75)
 */
function readUint64Return(logs: Uint8Array[] | undefined): bigint | undefined {
  const log = logs?.[logs.length - 1]
  if (
    !log ||
    log.length !== 12 ||
    Buffer.from(log.subarray(0, 4)).toString('hex') !== ARC4_RETURN_PREFIX
  ) {
    return undefined
  }
  return decodeUint64(log.subarray(4), 'bigint')
}

/**
 * Reads the output delivery from the Swap event an ORDER_ROUTER v4 route call
 * logs at settlement. v3 logs none, so this returns undefined for it.
 */
function readSwapEvent(
  logs: Uint8Array[] | undefined,
): { assetOut: bigint; delivered: bigint; beneficiary: string } | undefined {
  const log = logs?.find(
    (l) =>
      l.length === SWAP_EVENT_LENGTH &&
      Buffer.from(l.subarray(0, 4)).toString('hex') === SWAP_EVENT_SELECTOR,
  )
  if (!log) return undefined
  return {
    assetOut: decodeUint64(log.subarray(12, 20), 'bigint'),
    delivered: decodeUint64(log.subarray(45, 53), 'bigint'),
    beneficiary: encodeAddress(log.subarray(125, 157)),
  }
}

/**
 * A transaction signer function that supports both standard algosdk.TransactionSigner
 * and ARC-1 compliant signers that may return null for unsigned transactions.
 *
 * @param txnGroup - The complete transaction group to sign
 * @param indexesToSign - Array of indexes indicating which transactions need signing
 * @returns Array of signed transactions (may include nulls for ARC-1 compliant wallets)
 */
export type SignerFunction = (
  txnGroup: Transaction[],
  indexesToSign: number[],
) => Promise<(Uint8Array | null)[]>

/**
 * Status of the SwapComposer transaction group lifecycle
 */
export enum SwapComposerStatus {
  /** The atomic group is still under construction. */
  BUILDING,

  /** The atomic group has been finalized, but not yet signed. */
  BUILT,

  /** The atomic group has been finalized and signed, but not yet submitted to the network. */
  SIGNED,

  /** The atomic group has been finalized, signed, and submitted to the network. */
  SUBMITTED,

  /** The atomic group has been finalized, signed, submitted, and successfully committed to a block. */
  COMMITTED,
}

/**
 * Configuration for creating a SwapComposer instance
 */
export interface SwapComposerConfig {
  /** The quote response from fetchQuote() or newQuote() */
  readonly quote: FetchQuoteResponse | SwapQuote
  /** The swap transactions from fetchSwapTransactions() */
  readonly swapTxns: SwapTransaction[]
  /** Algodv2 client instance */
  readonly algodClient: Algodv2
  /** The address of the account that will sign transactions */
  readonly address: string
  /** Transaction signer function */
  readonly signer: TransactionSigner | SignerFunction
  /** Middleware to apply during swap composition */
  readonly middleware?: SwapMiddleware[]
  /** Optional note field for the user-signed input transaction (payment or asset transfer) */
  readonly note?: Uint8Array
  /** Debug logging level (propagated from RouterClient) */
  readonly debugLevel?: 'none' | 'info' | 'debug' | 'trace'
}

/**
 * Composer for building and executing atomic swap transaction groups
 *
 * The SwapComposer allows you to build complex transaction groups by adding custom
 * transactions before and after swap transactions. It handles pre-signed transactions,
 * automatic app opt-ins, and provides a fluent API for transaction group construction.
 *
 * @example
 * ```typescript
 * const quote = await router.fetchQuote({ ... })
 * const composer = await router.newSwap({ quote, address, slippage, signer })
 *
 * await composer
 *   .addTransaction(customTxn)
 *   .addSwapTransactions()
 *   .execute()
 * ```
 */
export class SwapComposer {
  /** The ATC used to compose the group */
  private atc = new AtomicTransactionComposer()

  /** The maximum size of an atomic transaction group. */
  static MAX_GROUP_SIZE: number = AtomicTransactionComposer.MAX_GROUP_SIZE

  /** Whether the swap transactions have been added to the atomic group. */
  private swapTransactionsAdded = false

  private readonly quote: FetchQuoteResponse | SwapQuote
  private readonly requiredAppOptIns: number[]
  private readonly swapTxns: SwapTransaction[]
  private readonly algodClient: Algodv2
  private readonly address: string
  private readonly signer: TransactionSigner | SignerFunction
  private readonly middleware: SwapMiddleware[]
  private readonly note?: Uint8Array
  private inputTransactionIndex?: number
  private outputTransactionIndex?: number
  private curveTransactionIndex?: number

  /** Summary data built incrementally during swap composition */
  private summaryData?: {
    inputAssetId: bigint
    outputAssetId: bigint
    inputAmount: bigint
    inputTxnId?: string
    outputTxnId?: string
    inputSender: string
    outputSender?: string
    outputAmount?: bigint
    /** Bonding-curve leg of a pre-bonding HayLaunch swap */
    launch?: {
      side: 'buy' | 'sell'
      tokenNum: bigint
      bondingTokenId: bigint
      appAddress: string
      curveTxnId?: string
      bondingAmount?: bigint
      refund: bigint
    }
  }

  /**
   * Create a new SwapComposer instance
   *
   * Note: Most developers should use RouterClient.newSwap() instead of constructing
   * this directly, as the factory method handles fetching swap transactions automatically.
   *
   * @param config - Configuration for the composer
   * @param config.quote - The quote response from fetchQuote()
   * @param config.swapTxns - The swap transactions from fetchSwapTransactions()
   * @param config.algodClient - Algodv2 client instance
   * @param config.address - The address of the account that will sign transactions
   * @param config.signer - Transaction signer function
   * @param config.middleware - Middleware to apply during swap composition
   */
  constructor(config: SwapComposerConfig) {
    // Set logger level from config
    if (config.debugLevel) {
      Logger.setLevel(config.debugLevel)
    }

    // Validate required parameters
    if (!config.quote) {
      throw new Error('Quote is required')
    }
    if (!config.swapTxns) {
      throw new Error('Swap transactions are required')
    }
    if (config.swapTxns.length === 0) {
      throw new Error('Swap transactions array cannot be empty')
    }
    if (!config.algodClient) {
      throw new Error('Algodv2 client instance is required')
    }
    if (!config.signer) {
      throw new Error('Signer is required')
    }

    this.quote = config.quote
    this.requiredAppOptIns = config.quote.requiredAppOptIns
    this.swapTxns = config.swapTxns
    this.algodClient = config.algodClient
    this.address = this.validateAddress(config.address)
    this.signer = config.signer
    this.middleware = config.middleware ?? []
    this.note = config.note
  }

  /**
   * Get the status of this composer's transaction group
   *
   * @returns The current status of the transaction group
   */
  getStatus(): SwapComposerStatus {
    return this.atc.getStatus() as unknown as SwapComposerStatus
  }

  /**
   * Get the number of transactions currently in this atomic group
   *
   * @returns The number of transactions in the group
   */
  count(): number {
    return this.atc.count()
  }

  /**
   * Add a transaction to the atomic group
   *
   * Transactions are added in the order methods are called. For example:
   * ```typescript
   * composer
   *   .addTransaction(txn1)      // Added first
   *   .addSwapTransactions()     // Added second
   *   .addTransaction(txn2)      // Added third
   * ```
   *
   * @param transaction - The transaction to add
   * @returns This composer instance for chaining
   * @throws Error if the composer is not in the BUILDING status
   * @throws Error if the maximum group size is exceeded
   * @throws Error if attempting to compose with a non-composable swap (Tinyman v1)
   */
  addTransaction(transaction: Transaction, signer = this.defaultSigner): this {
    // Check if the quote uses Tinyman v1 (non-composable protocol)
    const usesTinymanV1 =
      this.quote.flattenedRoute?.['Tinyman'] !== undefined &&
      this.quote.flattenedRoute['Tinyman'] > 0

    if (usesTinymanV1) {
      throw new Error(
        'Cannot add transactions to a swap group that uses Tinyman v1. ' +
          'Tinyman v1 produces non-composable transaction groups. ' +
          'Asset opt-ins, opt-outs, and other transactions must be sent in separate groups. ' +
          'If you need to support Tinyman v1 swaps, you must handle multi-group coordination manually.',
      )
    }

    this.atc.addTransaction({ txn: transaction, signer })
    return this
  }

  /**
   * Add a method call to the atomic group
   *
   * The `signer` property in the `methodCall` parameter is optional. If not provided,
   * the signer will default to the one passed as the second parameter, or the
   * configured signer from the constructor if no second parameter is provided.
   *
   * @param methodCall - The method call to add
   * @param signer - The signer to use for the method call (defaults to constructor signer)
   * @returns This composer instance for chaining
   * @throws Error if attempting to compose with a non-composable swap (Tinyman v1)
   */
  addMethodCall(methodCall: MethodCall, signer = this.defaultSigner): this {
    // Check if the quote uses Tinyman v1 (non-composable protocol)
    const usesTinymanV1 =
      this.quote.flattenedRoute?.['Tinyman'] !== undefined &&
      this.quote.flattenedRoute['Tinyman'] > 0

    if (usesTinymanV1) {
      throw new Error(
        'Cannot add method calls to a swap group that uses Tinyman v1. ' +
          'Tinyman v1 produces non-composable transaction groups. ' +
          'Asset opt-ins, opt-outs, and other transactions must be sent in separate groups. ' +
          'If you need to support Tinyman v1 swaps, you must handle multi-group coordination manually.',
      )
    }

    this.atc.addMethodCall({
      ...methodCall,
      signer: methodCall.signer ?? signer,
    })
    return this
  }

  /**
   * Add swap transactions to the atomic group
   *
   * This method automatically processes required app opt-ins, executes middleware hooks,
   * and adds all swap transactions from the quote. Can only be called once per composer instance.
   *
   * Middleware hooks are executed in this order:
   * 1. beforeSwap() - Add transactions before swap transactions
   * 2. Swap transactions (from API)
   * 3. afterSwap() - Add transactions after swap transactions
   *
   * @returns This composer instance for chaining
   * @throws Error if the swap transactions have already been added
   * @throws Error if the composer is not in the BUILDING status
   * @throws Error if the maximum group size is exceeded
   */
  async addSwapTransactions(): Promise<this> {
    if (this.swapTransactionsAdded) {
      throw new Error('Swap transactions have already been added')
    }

    if (this.getStatus() !== SwapComposerStatus.BUILDING) {
      throw new Error(
        'Cannot add swap transactions when composer status is not BUILDING',
      )
    }

    // Execute beforeSwap middleware hooks
    const beforeTxns = await this.executeMiddlewareHooks('beforeSwap')

    // Check total length before adding beforeSwap transactions
    if (this.atc.count() + beforeTxns.length > SwapComposer.MAX_GROUP_SIZE) {
      throw new Error(
        `Adding beforeSwap transactions exceeds the maximum atomic group size of ${SwapComposer.MAX_GROUP_SIZE}`,
      )
    }

    for (const txnWithSigner of beforeTxns) {
      this.atc.addTransaction(txnWithSigner)
    }

    // Process swap transactions and execute afterSwap hooks
    const {
      txns: processedTxns,
      inputTxnRelativeIndex,
      outputTxnRelativeIndex,
      curveTxnRelativeIndex,
    } = await this.processSwapTransactions()

    const afterTxns = await this.executeMiddlewareHooks('afterSwap')

    // Check total length before adding swap and afterSwap transactions
    const totalLength =
      this.atc.count() + processedTxns.length + afterTxns.length

    if (totalLength > SwapComposer.MAX_GROUP_SIZE) {
      throw new Error(
        `Adding swap transactions exceeds the maximum atomic group size of ${SwapComposer.MAX_GROUP_SIZE}`,
      )
    }

    // Calculate the absolute index of the user-signed input transaction
    // This is: current ATC count (user txns + beforeSwap) + relative index within processed txns
    if (inputTxnRelativeIndex !== undefined) {
      this.inputTransactionIndex = this.atc.count() + inputTxnRelativeIndex
    }

    // Calculate the absolute index of the output transaction (last app call in swap)
    if (outputTxnRelativeIndex !== undefined) {
      this.outputTransactionIndex = this.atc.count() + outputTxnRelativeIndex
    }

    // Calculate the absolute index of a launch swap's curve buy or sell call
    if (curveTxnRelativeIndex !== undefined) {
      this.curveTransactionIndex = this.atc.count() + curveTxnRelativeIndex
    }

    // Add swap transactions
    for (const txnWithSigner of processedTxns) {
      this.atc.addTransaction(txnWithSigner)
    }

    // Add afterSwap middleware transactions
    for (const txnWithSigner of afterTxns) {
      this.atc.addTransaction(txnWithSigner)
    }

    this.swapTransactionsAdded = true

    return this
  }

  /**
   * Finalize the transaction group by assigning group IDs
   *
   * This method builds the atomic transaction group, assigning group IDs to all transactions
   * if there is more than one transaction. After calling this method, the composer's status
   * will be at least BUILT.
   *
   * @returns Array of transactions with their associated signers
   *
   * @throws Error if the group contains 0 transactions
   *
   * @example
   * ```typescript
   * const composer = await router.newSwap({ quote, address, slippage, signer })
   * composer.addTransaction(customTxn)
   *
   * // Build the group to inspect transactions before signing
   * const txnsWithSigners = composer.buildGroup()
   * console.log('Group ID:', txnsWithSigners[0].txn.group)
   * console.log('Group length:', txnsWithSigners.length)
   * console.log('Status:', composer.getStatus()) // BUILT
   * ```
   */
  buildGroup(): TransactionWithSigner[] {
    return this.atc.buildGroup()
  }

  /**
   * Sign the transaction group
   *
   * Automatically adds swap transactions if not already added, builds the atomic group,
   * and signs all transactions using the configured signer.
   *
   * @returns A promise that resolves to an array of signed transaction blobs
   *
   * @example
   * ```typescript
   * const signedTxns = await composer.sign()
   * ```
   */
  async sign(): Promise<Uint8Array[]> {
    if (this.getStatus() >= SwapComposerStatus.SIGNED) {
      return this.atc.gatherSignatures()
    }

    // Auto-add swap transactions if needed
    if (!this.swapTransactionsAdded) {
      await this.addSwapTransactions()
    }

    return await this.atc.gatherSignatures()
  }

  /**
   * Submit the signed transactions to the network
   *
   * This method signs the transaction group (if not already signed) and submits
   * it to the Algorand network. Does not wait for confirmation.
   *
   * @returns The transaction IDs
   * @throws Error if the transaction group has already been submitted
   *
   * @example
   * ```typescript
   * const txIds = await composer.submit()
   * console.log('Submitted transactions:', txIds)
   * ```
   */
  async submit(): Promise<string[]> {
    // Auto-add swap transactions if needed (maintains backward compatibility)
    if (!this.swapTransactionsAdded) {
      await this.addSwapTransactions()
    }

    return await this.atc.submit(this.algodClient)
  }

  /**
   * Execute the swap
   *
   * Signs the transaction group, submits it to the network, and waits for confirmation.
   * This is the primary method for executing swaps and combines sign(), submit(), and
   * waitForConfirmation() into a single call.
   *
   * @param waitRounds - The number of rounds to wait for confirmation (default: 10)
   * @returns Object containing the confirmed round and transaction IDs
   * @throws Error if the transaction group has already been committed
   *
   * @example
   * ```typescript
   * const result = await composer.execute()
   * console.log(`Confirmed in round ${result.confirmedRound}`)
   * console.log('Transaction IDs:', result.txIds)
   * ```
   */
  async execute(waitRounds: number = DEFAULT_CONFIRMATION_ROUNDS): Promise<{
    confirmedRound: bigint
    txIds: string[]
    methodResults: ABIResult[]
  }> {
    try {
      // Auto-add swap transactions if needed (maintains backward compatibility)
      if (!this.swapTransactionsAdded) {
        await this.addSwapTransactions()
      }

      const { txIDs, ...result } = await this.atc.execute(
        this.algodClient,
        waitRounds,
      )

      // Store transaction IDs in summaryData
      if (this.summaryData) {
        if (this.inputTransactionIndex !== undefined) {
          this.summaryData.inputTxnId = txIDs[this.inputTransactionIndex]
        }
        if (this.outputTransactionIndex !== undefined) {
          this.summaryData.outputTxnId = txIDs[this.outputTransactionIndex]
        }
        if (
          this.summaryData.launch &&
          this.curveTransactionIndex !== undefined
        ) {
          this.summaryData.launch.curveTxnId = txIDs[this.curveTransactionIndex]
        }
      }

      // Extract actual output amount from confirmed transaction
      await this.extractActualOutputAmount()

      return {
        ...result,
        txIds: txIDs,
      }
    } catch (error) {
      // Log comprehensive failure context when swap execution fails
      const { logSwapExecutionFailure } = await import('./debug')
      logSwapExecutionFailure(
        {
          quote: this.quote,
          address: this.address,
          slippage: 0, // Not stored in composer, would need to be passed from client
          transactionCount: this.count(),
          middlewareCount: this.middleware.length,
          groupSize: this.count(),
        },
        error,
      )

      // Re-throw the error
      throw error
    }
  }

  /**
   * Get the transaction ID of the user-signed input transaction
   *
   * Returns the transaction ID of the payment or asset transfer transaction
   * that sends the input asset. This is the transaction whose note field can
   * be customized via the `note` config option.
   *
   * The transaction ID is only available after the group has been built
   * (after calling buildGroup(), sign(), submit(), or execute()).
   *
   * @returns The transaction ID, or undefined if the group hasn't been built yet
   *          or if the input transaction index couldn't be determined
   *
   * @example
   * ```typescript
   * const swap = await router.newSwap({
   *   quote,
   *   address,
   *   slippage,
   *   signer,
   *   note: new TextEncoder().encode('tracking-123')
   * })
   *
   * await swap.execute()
   * const inputTxId = swap.getInputTransactionId()
   * console.log('Input transaction ID:', inputTxId)
   * ```
   */
  getInputTransactionId(): string | undefined {
    if (this.getStatus() < SwapComposerStatus.BUILT) {
      return undefined
    }
    if (this.inputTransactionIndex === undefined) {
      return undefined
    }
    const txns = this.atc.buildGroup()
    const txn = txns[this.inputTransactionIndex]?.txn
    return txn?.txID()
  }

  /**
   * Get a summary of the swap amounts and fees
   *
   * Returns the exact input and output amounts, total transaction fees,
   * and transaction IDs. This is useful for displaying a complete summary
   * after a swap has been executed.
   *
   * Only available after calling execute() - returns undefined before execution.
   *
   * @returns SwapSummary containing exact amounts and fees, or undefined if not yet executed
   *
   * @example
   * ```typescript
   * const swap = await router.newSwap({ quote, address, slippage, signer })
   * const result = await swap.execute()
   *
   * const summary = swap.getSummary()
   * if (summary) {
   *   console.log('Sent:', summary.inputAmount, 'Received:', summary.outputAmount)
   *   console.log('Total fees:', summary.totalFees, 'microAlgos')
   * }
   * ```
   */
  getSummary(): SwapSummary | undefined {
    // Only return summary after execution when we have all the data
    if (
      !this.summaryData ||
      this.summaryData.outputAmount === undefined ||
      this.summaryData.inputTxnId === undefined ||
      this.summaryData.outputTxnId === undefined ||
      this.summaryData.outputSender === undefined
    ) {
      return undefined
    }

    const txns = this.atc.buildGroup()
    const totalFees = txns.reduce((sum, tws) => sum + tws.txn.fee, 0n)

    const launch = this.summaryData.launch
    const curveTxnId = launch?.curveTxnId

    return {
      inputAssetId: this.summaryData.inputAssetId,
      outputAssetId: this.summaryData.outputAssetId,
      inputAmount: this.summaryData.inputAmount,
      outputAmount: this.summaryData.outputAmount,
      type: this.quote.type as QuoteType,
      totalFees,
      transactionCount: txns.length,
      // On a launch sell, the tokens sold leave the user in the curve sell call
      inputTxnId:
        launch?.side === 'sell' && curveTxnId
          ? curveTxnId
          : this.summaryData.inputTxnId,
      outputTxnId: this.summaryData.outputTxnId,
      inputSender: this.summaryData.inputSender,
      outputSender: this.summaryData.outputSender,
      ...(launch &&
        curveTxnId && {
          launch: {
            side: launch.side,
            tokenNum: launch.tokenNum,
            curveTxnId,
            bondingAmount: launch.bondingAmount,
            refund: launch.refund,
          },
        }),
    }
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
   * Processes app opt-ins and decodes swap transactions from API response
   *
   * Also initializes summaryData with input transaction details and output transaction ID
   */
  private async processSwapTransactions(): Promise<{
    txns: TransactionWithSigner[]
    inputTxnRelativeIndex?: number
    outputTxnRelativeIndex?: number
    curveTxnRelativeIndex?: number
  }> {
    const appOptIns = await this.processRequiredAppOptIns()

    const decoded: DecodedSwapTransaction[] = this.swapTxns.map(
      (swapTxn, i) => {
        try {
          const txn = decodeUnsignedTransaction(
            Buffer.from(swapTxn.data, 'base64'),
          )
          delete txn.group
          return { txn, signature: swapTxn.signature }
        } catch (error) {
          throw new Error(
            `Failed to process swap transaction at index ${i}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
      },
    )

    const inputIndex = this.findInputTransactionIndex(decoded)
    const inputTxn =
      inputIndex !== undefined ? decoded[inputIndex]?.txn : undefined

    // Set the note on the input transaction only (using type assertion since
    // note is readonly but safe to modify before signing). Other user-signed
    // transactions can differ only by their notes, e.g. HayLaunch gas() calls.
    if (inputTxn && this.note !== undefined) {
      ;(inputTxn as { note: Uint8Array }).note = this.note
    }

    // Pre-signed transactions use the custom Haystack Router signer; the rest
    // are signed by the user
    const swapTxns: TransactionWithSigner[] = decoded.map(
      ({ txn, signature }) => ({
        txn,
        signer:
          signature === false
            ? this.defaultSigner
            : this.createSwapSigner(signature),
      }),
    )

    // Initialize summary data with input transaction details
    if (inputTxn) {
      // Extract input amount from payment or asset transfer
      const paymentAmount = inputTxn.payment?.amount
      const assetTransferAmount = inputTxn.assetTransfer?.amount
      const inputAmount = paymentAmount ?? assetTransferAmount ?? 0n

      this.summaryData = {
        inputAssetId: BigInt(this.quote.fromASAID),
        outputAssetId: BigInt(this.quote.toASAID),
        inputAmount,
        inputSender: this.address,
      }
    }

    const curveIndex = this.initLaunchSummary(decoded)

    // The last transaction in swapTxns is the app call that will contain
    // the inner transaction sending the output asset to the user. On a launch
    // buy the output comes from the curve buy call instead, wherever it is.
    // We'll get its ID after buildGroup() is called
    // Store the relative index so we can get the ID later
    const outputIndex =
      this.summaryData?.launch?.side === 'buy' && curveIndex !== undefined
        ? curveIndex
        : swapTxns.length - 1
    const outputTxnRelativeIndex =
      outputIndex >= 0 ? appOptIns.length + outputIndex : undefined

    return {
      txns: [...appOptIns, ...swapTxns],
      inputTxnRelativeIndex:
        inputIndex !== undefined ? appOptIns.length + inputIndex : undefined,
      outputTxnRelativeIndex,
      curveTxnRelativeIndex:
        curveIndex !== undefined ? appOptIns.length + curveIndex : undefined,
    }
  }

  /**
   * Finds the swap's input transaction among the API's transactions: the
   * first user-signed asset transfer to the router app, else the first
   * user-signed payment to it. The router's address comes from its pre-signed
   * app calls. Falls back to the last user-signed transaction for groups
   * without a router app call.
   *
   * The user may also pay the router ALGO for its fees and opt-ins, after the
   * input on ORDER_ROUTER v3 and before an ASA input on v4. The rule relies
   * on two invariants of the groups the router API builds: an ASA input is
   * the only asset transfer the user makes to the router, and no payment to
   * the router precedes an ALGO input.
   */
  private findInputTransactionIndex(
    txns: DecodedSwapTransaction[],
  ): number | undefined {
    const routerAppId = txns.find(
      ({ txn, signature }) =>
        signature !== false && txn.type === TransactionType.appl,
    )?.txn.applicationCall?.appIndex

    if (routerAppId !== undefined) {
      const routerAddress = getApplicationAddress(routerAppId).toString()
      const isUserTxnToRouter = ({ txn, signature }: DecodedSwapTransaction) =>
        signature === false &&
        (txn.payment?.receiver ?? txn.assetTransfer?.receiver)?.toString() ===
          routerAddress
      for (const type of [TransactionType.axfer, TransactionType.pay]) {
        const index = txns.findIndex(
          (t) => t.txn.type === type && isUserTxnToRouter(t),
        )
        if (index !== -1) return index
      }
    }

    for (let i = txns.length - 1; i >= 0; i--) {
      if (txns[i]?.signature === false) return i
    }
    return undefined
  }

  /**
   * For a launch quote, finds the user-signed curve buy or sell call and
   * records the curve leg in summaryData. On a sell, the input amount becomes
   * the launch tokens sold.
   *
   * @returns The curve call's index within the swap transactions, if found
   */
  private initLaunchSummary(
    txns: DecodedSwapTransaction[],
  ): number | undefined {
    const side = this.quote.launch?.side
    if (!side || !this.summaryData) return undefined

    const curveIndex = txns.findIndex(
      ({ txn, signature }) =>
        signature === false && launchCurveSide(txn) === side,
    )
    const curveCall = txns[curveIndex]?.txn.applicationCall
    // buy: (tokenNum, minTokensOut); sell: (tokenNum, tokensToSell, minBondingOut)
    const tokenNumArg = curveCall?.appArgs[1]
    if (!curveCall || !tokenNumArg) return undefined

    const appAddress = getApplicationAddress(curveCall.appIndex).toString()

    let bondingAmount: bigint | undefined
    if (side === 'buy') {
      // ARC-4 transaction arguments directly precede the app call, and the
      // bonding payment to the curve is the buy method's last one
      const payment = txns[curveIndex - 1]?.txn
      const receiver =
        payment?.payment?.receiver ?? payment?.assetTransfer?.receiver
      if (receiver?.toString() === appAddress) {
        bondingAmount =
          payment?.payment?.amount ?? payment?.assetTransfer?.amount
      }
    } else {
      const tokensToSell = curveCall.appArgs[2]
      if (tokensToSell) {
        this.summaryData.inputAmount = decodeUint64(tokensToSell, 'bigint')
      }
    }

    this.summaryData.launch = {
      side,
      tokenNum: decodeUint64(tokenNumArg, 'bigint'),
      bondingTokenId: BigInt(this.quote.launch?.bondingTokenId ?? 0),
      appAddress,
      bondingAmount,
      refund: 0n,
    }

    return curveIndex
  }

  /**
   * Creates opt-in transactions for apps the user hasn't opted into yet
   */
  private async processRequiredAppOptIns(): Promise<TransactionWithSigner[]> {
    // Fetch account information
    const accountInfo = await this.algodClient
      .accountInformation(this.address)
      .do()

    // Check app opt-ins
    const userApps =
      accountInfo?.appsLocalState?.map((app) => Number(app.id)) || []
    const appsToOptIn = this.requiredAppOptIns.filter(
      (appId) => !userApps.includes(appId),
    )

    if (appsToOptIn.length === 0) return []

    const suggestedParams = await this.algodClient.getTransactionParams().do()

    return appsToOptIn.map((appId) => ({
      txn: makeApplicationOptInTxnFromObject({
        sender: this.address,
        appIndex: appId,
        suggestedParams,
      }),
      signer: this.defaultSigner,
    }))
  }

  /**
   * The default signer function that uses the configured signer
   */
  private defaultSigner: TransactionSigner = async (
    txnGroup: Transaction[],
    indexesToSign: number[],
  ) => {
    const result = await this.signer(txnGroup, indexesToSign)
    return result.filter((txn): txn is Uint8Array => txn !== null)
  }

  /**
   * Creates a TransactionSigner function for Haystack Router pre-signed transactions
   */
  private createSwapSigner(signature: Signature): TransactionSigner {
    return async (
      txnGroup: Transaction[],
      indexesToSign: number[],
    ): Promise<Uint8Array[]> => {
      return indexesToSign.map((i) => {
        const txn = txnGroup[i]
        if (!txn) throw new Error(`Transaction at index ${i} not found`)
        return this.signSwapTransaction(txn, signature)
      })
    }
  }

  /**
   * Re-signs a Haystack Router transaction using the provided logic signature or secret key
   */
  private signSwapTransaction(
    transaction: Transaction,
    signature: Signature,
  ): Uint8Array {
    try {
      if (signature.type === 'logic_signature') {
        // Decode the signature value to extract the logic signature
        const valueArray = signature.value as Record<string, number>
        const valueBytes = new Uint8Array(Object.values(valueArray))
        const decoded = msgpackRawDecode(valueBytes) as {
          lsig?: { l: Uint8Array; arg?: Uint8Array[] }
        }

        if (!decoded.lsig) {
          throw new Error('Logic signature structure missing lsig field')
        }

        const lsig = decoded.lsig
        const logicSigAccount = new LogicSigAccount(lsig.l, lsig.arg)

        const signedTxn = signLogicSigTransactionObject(
          transaction,
          logicSigAccount,
        )
        return signedTxn.blob
      } else if (signature.type === 'secret_key') {
        // Convert signature.value (Record<string, number>) to Uint8Array
        const valueArray = signature.value as Record<string, number>
        const secretKey = new Uint8Array(Object.values(valueArray))
        const signedTxn = signTransaction(transaction, secretKey)
        return signedTxn.blob
      } else {
        throw new Error(`Unsupported signature type: ${signature.type}`)
      }
    } catch (error) {
      throw new Error(
        `Failed to re-sign transaction: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * Execute middleware hooks (beforeSwap or afterSwap)
   */
  private async executeMiddlewareHooks(
    hookName: 'beforeSwap' | 'afterSwap',
  ): Promise<TransactionWithSigner[]> {
    const allTxns: TransactionWithSigner[] = []

    // Convert to SwapQuote if needed
    const quote: SwapQuote =
      'createdAt' in this.quote
        ? this.quote
        : {
            ...this.quote,
            quote: this.quote.quote === '' ? 0n : BigInt(this.quote.quote),
            amount: 0n, // Not available in FetchQuoteResponse
            launch: this.quote.launch && toSwapLaunchQuote(this.quote.launch),
            createdAt: Date.now(),
          }

    // Create quote context for middleware shouldApply checks
    const quoteContext: QuoteContext = {
      fromASAID: BigInt(this.quote.fromASAID),
      toASAID: BigInt(this.quote.toASAID),
      amount: quote.amount,
      type: this.quote.type as QuoteType,
      address: quote.address,
      algodClient: this.algodClient,
    }

    for (const mw of this.middleware) {
      const shouldApply = await mw.shouldApply(quoteContext)

      if (!shouldApply || !mw[hookName]) {
        continue
      }

      // Create swap context for middleware hooks (only when needed)
      const suggestedParams = await this.algodClient.getTransactionParams().do()
      const swapContext: SwapContext = {
        quote,
        address: this.address,
        algodClient: this.algodClient,
        suggestedParams,
        fromASAID: BigInt(this.quote.fromASAID),
        toASAID: BigInt(this.quote.toASAID),
        signer: this.defaultSigner,
      }

      const txns = await mw[hookName](swapContext)

      allTxns.push(...txns)
    }

    return allTxns
  }

  /**
   * Extract the actual output amount from the confirmed output transaction
   *
   * Analyzes only the output transaction (last app call in the swap). On
   * ORDER_ROUTER v4 that is the route call, whose Swap event gives the amount
   * delivered. v3 logs no event, so the output is its first inner transaction
   * that transfers the output asset to the user (it makes only one). On a
   * launch buy the output is a balance on the HayLaunch app, so it is read
   * from the curve buy call's return value instead.
   */
  private async extractActualOutputAmount(): Promise<void> {
    if (!this.summaryData?.outputTxnId) {
      return
    }

    const outputAssetId = this.summaryData.outputAssetId
    const userAddress = this.address
    const launch = this.summaryData.launch

    try {
      const pendingInfo = await this.algodClient
        .pendingTransactionInformation(this.summaryData.outputTxnId)
        .do()

      if (launch?.side === 'buy') {
        // The buy call returns the tokens credited to the buyer's balance
        const tokensCredited = readUint64Return(pendingInfo.logs)
        if (tokensCredited !== undefined) {
          this.summaryData.outputAmount = tokensCredited
          this.summaryData.outputSender = launch.appAddress
        }

        // A buy that completes bonding refunds the unused bonding asset
        for (const innerTxn of pendingInfo.innerTxns ?? []) {
          const txn = innerTxn.txn.txn
          if (launch.bondingTokenId === 0n) {
            if (txn.payment?.receiver.toString() === userAddress) {
              launch.refund += txn.payment.amount
            }
          } else if (
            txn.assetTransfer?.receiver.toString() === userAddress &&
            txn.assetTransfer.assetIndex === launch.bondingTokenId
          ) {
            launch.refund += txn.assetTransfer.amount
          }
        }
        return
      }

      const swapEvent = readSwapEvent(pendingInfo.logs)
      const routeCall = swapEvent && pendingInfo.txn.txn.applicationCall
      if (swapEvent && routeCall) {
        // v4: every payout goes to the event's beneficiary
        if (
          swapEvent.assetOut === outputAssetId &&
          swapEvent.beneficiary === userAddress
        ) {
          this.summaryData.outputAmount = swapEvent.delivered
          this.summaryData.outputSender = getApplicationAddress(
            routeCall.appIndex,
          ).toString()
        }
      } else {
        for (const innerTxn of pendingInfo.innerTxns ?? []) {
          const txn = innerTxn.txn.txn
          const payment = txn.payment
          const assetTransfer = txn.assetTransfer

          // Get receiver address based on transaction type
          const receiver = payment?.receiver ?? assetTransfer?.receiver
          if (!receiver) continue

          // Check if this transfer is to the user
          if (receiver.toString() !== userAddress) continue

          // Get sender address for outputSender
          const senderAddress = txn.sender.toString()

          if (outputAssetId === 0n && payment?.amount != null) {
            // ALGO output to user
            this.summaryData.outputAmount = payment.amount
            this.summaryData.outputSender = senderAddress
            break
          } else if (outputAssetId !== 0n && assetTransfer) {
            // ASA output - verify it's the right asset
            const assetId = assetTransfer.assetIndex
            if (assetId === outputAssetId && assetTransfer.amount != null) {
              this.summaryData.outputAmount = assetTransfer.amount
              this.summaryData.outputSender = senderAddress
              break
            }
          }
        }
      }
    } catch {
      // Silently fail - outputAmount will remain undefined
    }

    // On a launch sell, the curve call returns the bonding asset paid out after
    // fees. It's looked up separately so a failure here keeps the output above.
    if (launch?.side === 'sell' && launch.curveTxnId) {
      try {
        const curveInfo = await this.algodClient
          .pendingTransactionInformation(launch.curveTxnId)
          .do()
        launch.bondingAmount = readUint64Return(curveInfo.logs)
      } catch {
        // Silently fail - bondingAmount will remain undefined
      }
    }
  }
}
