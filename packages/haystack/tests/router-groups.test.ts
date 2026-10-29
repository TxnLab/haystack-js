import { createHash } from 'node:crypto'
import algosdk from 'algosdk'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SwapComposer } from '../src/composer'
import type { FetchQuoteResponse, SwapTransaction } from '../src/types'

/**
 * Swap groups shaped as the router API builds them for ORDER_ROUTER v3 and v4.
 *
 * v3: [User_opt_into_assets] [input] [funding] [User_swap...] [User_swap_finalize]
 * v4: [refs carriers] [opt_in payment, opt_in] [funding] [input] [route]
 *
 * Either may start with the user's opt-in to the output (an asset transfer to
 * themselves) and a referrer escrow's opt-in (a payment to the escrow and the
 * user's call to the referrer treasury). On v4 the user's payments funding the
 * router's opt-ins and fees come before an ASA input, and the route call logs
 * a Swap event with the amount delivered.
 */

const V3_APP = 3172554435n
const V4_APP = 3757715482n
const USDC = 31566704n

const suggestedParams = {
  fee: 1000,
  firstValid: 1000,
  lastValid: 2000,
  minFee: 1000,
  genesisID: 'mainnet-v1.0',
  genesisHash: Buffer.from(
    'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
    'base64',
  ),
}

const user = algosdk.generateAccount().addr.toString()
const hotWallet = algosdk.generateAccount().addr.toString()
const treasury = algosdk.generateAccount().addr.toString()

const ROUTER_SIGNATURE: SwapTransaction['signature'] = {
  type: 'secret_key',
  value: 'unused',
}

const toSwapTxn = (
  txn: algosdk.Transaction,
  signature: SwapTransaction['signature'] = false,
): SwapTransaction => ({
  data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'),
  group: '',
  logicSigBlob: false,
  signature,
})

/** A pre-signed router app call, told apart from the others by its note */
const routerCall = (appIndex: bigint, note: string) =>
  toSwapTxn(
    algosdk.makeApplicationNoOpTxnFromObject({
      sender: hotWallet,
      appIndex,
      suggestedParams,
      note: new TextEncoder().encode(note),
    }),
    ROUTER_SIGNATURE,
  )

const userPay = (appIndex: bigint, amount: number, note: string) =>
  toSwapTxn(
    algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: algosdk.getApplicationAddress(appIndex),
      amount,
      suggestedParams,
      note: new TextEncoder().encode(note),
    }),
  )

const userAxfer = (appIndex: bigint, amount: number, assetIndex: bigint) =>
  toSwapTxn(
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: algosdk.getApplicationAddress(appIndex),
      amount,
      assetIndex,
      suggestedParams,
    }),
  )

/** An inner payment or asset transfer as a pending transaction response has it */
const innerPay = (receiver: string, amount: number) => ({
  txn: {
    txn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.getApplicationAddress(V4_APP),
      receiver,
      amount,
      suggestedParams,
    }),
  },
})
const innerAxfer = (receiver: string, amount: number, assetIndex: bigint) => ({
  txn: {
    txn: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: algosdk.getApplicationAddress(V4_APP),
      receiver,
      amount,
      assetIndex,
      suggestedParams,
    }),
  },
})

const quote = (fromASAID: bigint, toASAID: bigint) =>
  ({
    fromASAID: Number(fromASAID),
    toASAID: Number(toASAID),
    quote: '1000000',
    route: [],
    txnPayload: { iv: 'test-iv', data: 'test-data' },
    requiredAppOptIns: [],
  }) as unknown as FetchQuoteResponse

describe('SwapComposer on ORDER_ROUTER v3 and v4 groups', () => {
  let mockAlgodClient: algosdk.Algodv2
  let pendingInfo: Record<string, unknown>

  beforeEach(() => {
    pendingInfo = {}
    mockAlgodClient = {
      accountInformation: vi.fn().mockReturnValue({
        do: vi.fn().mockResolvedValue({ appsLocalState: [], assets: [] }),
      }),
      pendingTransactionInformation: vi.fn((txId: string) => ({
        do: vi.fn().mockResolvedValue(pendingInfo[txId] ?? {}),
      })),
      getTransactionParams: vi.fn().mockReturnValue({
        do: vi.fn().mockResolvedValue(suggestedParams),
      }),
    } as any
  })

  const createComposer = (
    q: FetchQuoteResponse,
    swapTxns: SwapTransaction[],
    note?: Uint8Array,
  ) =>
    new SwapComposer({
      quote: q,
      swapTxns,
      algodClient: mockAlgodClient,
      address: user,
      signer: async (txns: algosdk.Transaction[]) =>
        txns.map(() => new Uint8Array(0)),
      note,
    })

  /** Build the group and stub the ATC so execute() "confirms" it */
  const buildAndStubExecute = async (composer: SwapComposer) => {
    await composer.addSwapTransactions()
    const txns = composer.buildGroup()
    const txIds = txns.map(({ txn }) => txn.txID())
    vi.spyOn((composer as any).atc, 'execute').mockResolvedValue({
      confirmedRound: 1n,
      txIDs: txIds,
      methodResults: [],
    })
    return { txns, txIds }
  }

  describe('input transaction', () => {
    // carrier, opt_in payment, opt_in, funding, input, route
    const v4AsaInput = () => [
      routerCall(V4_APP, 'carrier'),
      userPay(V4_APP, 200_000, 'opt-in'),
      routerCall(V4_APP, 'opt_in'),
      userPay(V4_APP, 102_000, 'funding'),
      userAxfer(V4_APP, 5_000_000, USDC),
      routerCall(V4_APP, 'route'),
    ]

    it('is the ASA input on v4, not the opt-in or funding payment before it', async () => {
      const note = new TextEncoder().encode('tracking-id')
      const composer = createComposer(quote(USDC, 0n), v4AsaInput(), note)
      const { txns, txIds } = await buildAndStubExecute(composer)

      expect(composer.getInputTransactionId()).toBe(txns[4]?.txn.txID())
      expect(txns[4]?.txn.note).toEqual(note)
      expect(new TextDecoder().decode(txns[1]?.txn.note)).toBe('opt-in')
      expect(new TextDecoder().decode(txns[3]?.txn.note)).toBe('funding')

      pendingInfo[txIds[5]!] = { innerTxns: [innerPay(user, 3_000_000)] }
      await composer.execute()
      expect(composer.getSummary()?.inputAmount).toBe(5_000_000n)
    })

    it('is the ASA input on v4 behind the output and escrow opt-ins', async () => {
      const composer = createComposer(quote(USDC, 0n), [
        toSwapTxn(
          algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            sender: user,
            receiver: user,
            amount: 0,
            assetIndex: USDC,
            suggestedParams,
          }),
        ),
        toSwapTxn(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: user,
            receiver: treasury,
            amount: 100_000,
            suggestedParams,
          }),
        ),
        toSwapTxn(
          algosdk.makeApplicationNoOpTxnFromObject({
            sender: user,
            appIndex: 3041355560n,
            suggestedParams,
          }),
        ),
        ...v4AsaInput(),
      ])
      const { txns } = await buildAndStubExecute(composer)

      expect(composer.getInputTransactionId()).toBe(txns[7]?.txn.txID())
    })

    // The input carries the route's funding: 1,000,000 to swap plus 2,000
    it('is the ALGO input on v4, which no payment to the router precedes', async () => {
      const composer = createComposer(quote(0n, USDC), [
        routerCall(V4_APP, 'carrier'),
        userPay(V4_APP, 1_002_000, 'input'),
        routerCall(V4_APP, 'route'),
      ])
      const { txns, txIds } = await buildAndStubExecute(composer)

      expect(composer.getInputTransactionId()).toBe(txns[1]?.txn.txID())
      pendingInfo[txIds[2]!] = { innerTxns: [innerAxfer(user, 990, USDC)] }
      await composer.execute()
      expect(composer.getSummary()?.inputAmount).toBe(1_002_000n)
    })

    it('is the ALGO input on v3, not the funding payment after it', async () => {
      const composer = createComposer(quote(0n, USDC), [
        routerCall(V3_APP, 'User_opt_into_assets'),
        userPay(V3_APP, 1_000_000, 'input'),
        userPay(V3_APP, 2_000, 'funding'),
        routerCall(V3_APP, 'User_swap'),
        routerCall(V3_APP, 'User_swap_finalize'),
      ])
      const { txns, txIds } = await buildAndStubExecute(composer)

      expect(composer.getInputTransactionId()).toBe(txns[1]?.txn.txID())
      pendingInfo[txIds[4]!] = { innerTxns: [innerAxfer(user, 990, USDC)] }
      await composer.execute()
      expect(composer.getSummary()?.inputAmount).toBe(1_000_000n)
    })

    it('is the ASA input on v3', async () => {
      const composer = createComposer(quote(USDC, 0n), [
        routerCall(V3_APP, 'User_opt_into_assets'),
        userAxfer(V3_APP, 5_000_000, USDC),
        userPay(V3_APP, 2_000, 'funding'),
        routerCall(V3_APP, 'User_swap'),
        routerCall(V3_APP, 'User_swap_finalize'),
      ])
      const { txns } = await buildAndStubExecute(composer)

      expect(composer.getInputTransactionId()).toBe(txns[1]?.txn.txID())
    })
  })

  describe('output amount', () => {
    const v4Group = (from: bigint) => [
      from === 0n
        ? userPay(V4_APP, 1_000_000, 'input')
        : userAxfer(V4_APP, 1_000_000, from),
      routerCall(V4_APP, 'route'),
    ]

    /**
     * The route call's Swap event, with the selector derived from the
     * contract's event signature (so a wrong selector in the SDK fails here)
     */
    const swapEventLog = (e: {
      assetIn: bigint
      assetOut: bigint
      delivered: bigint
      beneficiary: string
    }) => {
      const selector = createHash('sha512-256')
        .update(
          'Swap(uint64,uint64,uint8,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,address,address)',
        )
        .digest()
        .subarray(0, 4)
      // amount, amountIn, outDelta, then delivered; the fields after it are
      // refundSwapped, refunded, algoReturned, treasuryFee, referrerFee
      const uint64s = (...vs: bigint[]) =>
        vs.map((v) => algosdk.encodeUint64(v))
      return Buffer.concat([
        selector,
        ...uint64s(e.assetIn, e.assetOut),
        Uint8Array.of(1),
        ...uint64s(1n, 2n, 3n, e.delivered, 5n, 6n, 7n, 8n, 9n),
        algosdk.decodeAddress(user).publicKey,
        algosdk.decodeAddress(e.beneficiary).publicKey,
        algosdk.decodeAddress(treasury).publicKey,
      ])
    }

    /** The pending info of a confirmed v4 route call */
    const routeInfo = (
      route: algosdk.Transaction,
      logs: Uint8Array[],
      innerTxns: unknown[],
    ) => ({ txn: { txn: route }, logs, innerTxns })

    // fixed-output: fee, delivery, the refund sub-swap's deposit, the input
    // it refunds, the ALGO the route didn't use
    it('is the Swap event delivery on v4, not the inner transfers', async () => {
      const composer = createComposer(quote(USDC, 0n), v4Group(USDC))
      const { txns, txIds } = await buildAndStubExecute(composer)
      const event = swapEventLog({
        assetIn: USDC,
        assetOut: 0n,
        delivered: 3_000_000n,
        beneficiary: user,
      })
      expect(event.length).toBe(189)
      pendingInfo[txIds[1]!] = routeInfo(
        txns[1]!.txn,
        [new TextEncoder().encode('skipped: nothing to swap'), event],
        // the user's first ALGO from the route isn't the delivery
        [
          innerPay(user, 4_000),
          innerPay(user, 3_000_000),
          innerAxfer(user, 12_345, USDC),
        ],
      )

      await composer.execute()

      expect(composer.getSummary()?.outputAmount).toBe(3_000_000n)
      expect(composer.getSummary()?.outputSender).toBe(
        algosdk.getApplicationAddress(V4_APP).toString(),
      )
    })

    it('is unknown on v4 when the Swap event pays another beneficiary', async () => {
      const composer = createComposer(quote(0n, USDC), v4Group(0n))
      const { txns, txIds } = await buildAndStubExecute(composer)
      pendingInfo[txIds[1]!] = routeInfo(
        txns[1]!.txn,
        [
          swapEventLog({
            assetIn: 0n,
            assetOut: USDC,
            delivered: 990n,
            beneficiary: treasury,
          }),
        ],
        [innerAxfer(user, 990, USDC)],
      )

      await composer.execute()

      expect(composer.getSummary()).toBeUndefined()
    })

    it('is unknown on v4 when the Swap event delivers another asset', async () => {
      const composer = createComposer(quote(0n, USDC), v4Group(0n))
      const { txns, txIds } = await buildAndStubExecute(composer)
      pendingInfo[txIds[1]!] = routeInfo(
        txns[1]!.txn,
        [
          swapEventLog({
            assetIn: 0n,
            assetOut: 0n,
            delivered: 990n,
            beneficiary: user,
          }),
        ],
        [innerAxfer(user, 990, USDC)],
      )

      await composer.execute()

      expect(composer.getSummary()).toBeUndefined()
    })

    it('is the first inner transfer of the output to the user on v3', async () => {
      const composer = createComposer(quote(0n, USDC), [
        userPay(V3_APP, 1_000_000, 'input'),
        routerCall(V3_APP, 'User_swap'),
        routerCall(V3_APP, 'User_swap_finalize'),
      ])
      const { txIds } = await buildAndStubExecute(composer)
      pendingInfo[txIds[2]!] = {
        logs: [],
        innerTxns: [
          innerAxfer(treasury, 8, USDC),
          innerPay(user, 50_000),
          innerAxfer(user, 990, USDC),
          innerAxfer(user, 5, USDC),
        ],
      }

      await composer.execute()

      expect(composer.getSummary()?.outputAmount).toBe(990n)
    })

    it('is the first inner payment to the user on v3 when the output is ALGO', async () => {
      const composer = createComposer(quote(USDC, 0n), [
        userAxfer(V3_APP, 1_000_000, USDC),
        routerCall(V3_APP, 'User_swap'),
        routerCall(V3_APP, 'User_swap_finalize'),
      ])
      const { txIds } = await buildAndStubExecute(composer)
      pendingInfo[txIds[2]!] = {
        logs: [],
        innerTxns: [innerPay(user, 50_000), innerPay(user, 7_000)],
      }

      await composer.execute()

      expect(composer.getSummary()?.outputAmount).toBe(50_000n)
    })
  })
})
