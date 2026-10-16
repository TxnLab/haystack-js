import algosdk from 'algosdk'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SwapComposer } from '../src/composer'
import buyFixture from './fixtures/launch/buy.json'
import sellFixture from './fixtures/launch/sell.json'
import type { SwapContext } from '../src/middleware'
import type { FetchQuoteResponse, SwapTransaction } from '../src/types'

/**
 * Launch-token swap groups captured from the router's fetchExecuteSwapTxns on
 * 2026-10-14 (HayLaunch token #1, bonded in ALGO). Router signatures are
 * redacted; these tests build and inspect groups but never sign router txns.
 *
 * Buy (14 txns):  0 router opt-in, 1 user USDC -> router, 2-8 router swaps,
 *                 9-10 user gas() calls, 11 user MBR pay, 12 user pay -> curve,
 *                 13 user buyWithAlgoWithLimit
 * Sell (10 txns): 0 user gas(), 1 user sellWithLimit, 2 router opt-in,
 *                 3 user ALGO -> router, 4-9 router swaps
 */

const ROUTER_ADDRESS = algosdk.getApplicationAddress(3172554435n).toString()
const HAYLAUNCH_ADDRESS = algosdk.getApplicationAddress(3452678093n).toString()

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

interface Fixture {
  address: string
  quote: unknown
  txns: unknown[]
}

/** ARC-4 return log for a uint64 value */
const returnLog = (value: bigint): Uint8Array =>
  new Uint8Array([
    ...Buffer.from('151f7c75', 'hex'),
    ...algosdk.encodeUint64(value),
  ])

/** An inner transaction as it appears in a pending transaction response */
const inner = (txn: algosdk.Transaction) => ({ txn: { txn } })

/** Encode a transaction as the API returns it */
const toSwapTxn = (
  txn: algosdk.Transaction,
  signature: SwapTransaction['signature'] = false,
): SwapTransaction => ({
  data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'),
  group: '',
  logicSigBlob: false,
  signature,
})

const ROUTER_SIGNATURE: SwapTransaction['signature'] = {
  type: 'secret_key',
  value: 'unused',
}

describe('SwapComposer launch token swaps', () => {
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

  const createComposer = (fixture: Fixture, note?: Uint8Array) =>
    new SwapComposer({
      quote: fixture.quote as FetchQuoteResponse,
      swapTxns: fixture.txns as SwapTransaction[],
      algodClient: mockAlgodClient,
      address: fixture.address,
      signer: async (txns: algosdk.Transaction[]) =>
        txns.map(() => new Uint8Array(0)),
      note,
    })

  /** Build the group and stub the ATC so execute() "confirms" it */
  const buildAndStubExecute = async (composer: SwapComposer) => {
    await composer.addSwapTransactions()
    const txIds = composer.buildGroup().map(({ txn }) => txn.txID())
    vi.spyOn((composer as any).atc, 'execute').mockResolvedValue({
      confirmedRound: 1n,
      txIDs: txIds,
      methodResults: [],
    })
    return txIds
  }

  describe('input transaction', () => {
    it('picks the user transfer to the router on a buy, not the curve call', async () => {
      const composer = createComposer(buyFixture)
      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      expect(txns).toHaveLength(14)
      expect(txns[1]?.txn.assetTransfer?.receiver.toString()).toBe(
        ROUTER_ADDRESS,
      )
      expect(composer.getInputTransactionId()).toBe(txns[1]?.txn.txID())
    })

    it('picks the user payment to the router on a sell', async () => {
      const composer = createComposer(sellFixture)
      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      expect(txns).toHaveLength(10)
      expect(txns[3]?.txn.payment?.receiver.toString()).toBe(ROUTER_ADDRESS)
      expect(composer.getInputTransactionId()).toBe(txns[3]?.txn.txID())
    })
  })

  describe('note', () => {
    const note = new TextEncoder().encode('tracking-id-123')
    const decode = (bytes: Uint8Array | undefined) =>
      new TextDecoder().decode(bytes)

    it('is set on the buy input only, keeping the gas() calls distinct', async () => {
      const composer = createComposer(buyFixture, note)
      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      expect(txns[1]?.txn.note).toEqual(note)
      expect(decode(txns[9]?.txn.note)).toBe('gas-0')
      expect(decode(txns[10]?.txn.note)).toBe('gas-1')
      expect(txns[9]?.txn.txID()).not.toBe(txns[10]?.txn.txID())
      for (const i of [11, 12, 13]) {
        expect(txns[i]?.txn.note).not.toEqual(note)
      }
    })

    it('is set on the sell input only', async () => {
      const composer = createComposer(sellFixture, note)
      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      expect(txns[3]?.txn.note).toEqual(note)
      expect(decode(txns[0]?.txn.note)).toBe('gas-0')
      expect(txns[1]?.txn.note).not.toEqual(note)
    })
  })

  describe('getSummary', () => {
    it('reports a buy with the tokens credited by the curve call', async () => {
      const composer = createComposer(buyFixture)
      const txIds = await buildAndStubExecute(composer)
      pendingInfo[txIds[13]!] = {
        logs: [returnLog(5_607_413_404_650n)],
        innerTxns: [],
      }

      await composer.execute()

      expect(composer.getSummary()).toMatchObject({
        inputAssetId: 31566704n,
        outputAssetId: 3454502531n,
        inputAmount: 10_000_000n,
        outputAmount: 5_607_413_404_650n,
        inputTxnId: txIds[1],
        outputTxnId: txIds[13],
        inputSender: buyFixture.address,
        outputSender: HAYLAUNCH_ADDRESS,
        transactionCount: 14,
        launch: {
          side: 'buy',
          tokenNum: 1n,
          curveTxnId: txIds[13],
          bondingAmount: 85_857_880n,
          refund: 0n,
        },
      })
    })

    it('reports the refund of a buy that completes bonding', async () => {
      const composer = createComposer(buyFixture)
      const txIds = await buildAndStubExecute(composer)
      const refund = (amount: number) =>
        algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: HAYLAUNCH_ADDRESS,
          receiver: buyFixture.address,
          amount,
          suggestedParams,
        })
      const toSomeoneElse = algosdk.makePaymentTxnWithSuggestedParamsFromObject(
        {
          sender: HAYLAUNCH_ADDRESS,
          receiver: ROUTER_ADDRESS,
          amount: 999,
          suggestedParams,
        },
      )
      pendingInfo[txIds[13]!] = {
        logs: [returnLog(4_000_000_000_000n)],
        innerTxns: [
          inner(refund(1_000_000)),
          inner(toSomeoneElse),
          inner(refund(234_567)),
        ],
      }

      await composer.execute()

      const summary = composer.getSummary()
      expect(summary?.outputAmount).toBe(4_000_000_000_000n)
      expect(summary?.launch?.refund).toBe(1_234_567n)
    })

    it('falls back to a regular summary when no curve call is found', async () => {
      const composer = createComposer({
        ...buyFixture,
        txns: buyFixture.txns.slice(0, 13),
      })
      const txIds = await buildAndStubExecute(composer)
      expect(txIds).toHaveLength(13)
      const output = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: ROUTER_ADDRESS,
        receiver: buyFixture.address,
        amount: 42,
        assetIndex: 3454502531,
        suggestedParams,
      })
      pendingInfo[txIds[12]!] = { innerTxns: [inner(output)] }

      await composer.execute()

      const summary = composer.getSummary()
      expect(summary?.outputTxnId).toBe(txIds[12])
      expect(summary?.outputAmount).toBe(42n)
      expect(summary?.launch).toBeUndefined()
    })

    it('is unavailable for a buy when the curve call has no return value', async () => {
      const composer = createComposer(buyFixture)
      const txIds = await buildAndStubExecute(composer)
      pendingInfo[txIds[13]!] = { logs: [], innerTxns: [] }

      await composer.execute()

      expect(composer.getSummary()).toBeUndefined()
    })

    it('reports a sell with the tokens sold as input and the curve payout', async () => {
      const composer = createComposer(sellFixture)
      const txIds = await buildAndStubExecute(composer)
      const output = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: ROUTER_ADDRESS,
        receiver: sellFixture.address,
        amount: 1_109_343,
        assetIndex: 31566704,
        suggestedParams,
      })
      pendingInfo[txIds[9]!] = { innerTxns: [inner(output)] }
      pendingInfo[txIds[1]!] = { logs: [returnLog(9_748_324n)] }

      await composer.execute()

      expect(composer.getSummary()).toMatchObject({
        inputAssetId: 3454502531n,
        outputAssetId: 31566704n,
        inputAmount: 660_230_328_964n,
        outputAmount: 1_109_343n,
        inputTxnId: txIds[1],
        outputTxnId: txIds[9],
        inputSender: sellFixture.address,
        outputSender: ROUTER_ADDRESS,
        transactionCount: 10,
        launch: {
          side: 'sell',
          tokenNum: 1n,
          curveTxnId: txIds[1],
          bondingAmount: 9_748_324n,
          refund: 0n,
        },
      })
    })

    it('has no launch details when the quote has no launch object', async () => {
      const composer = createComposer({
        ...sellFixture,
        quote: { ...sellFixture.quote, launch: undefined },
      })
      const txIds = await buildAndStubExecute(composer)
      const output = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: ROUTER_ADDRESS,
        receiver: sellFixture.address,
        amount: 1_109_343,
        assetIndex: 31566704,
        suggestedParams,
      })
      pendingInfo[txIds[9]!] = { innerTxns: [inner(output)] }

      await composer.execute()

      const summary = composer.getSummary()
      // Without launch info the input is the route's input transfer
      expect(summary?.inputAmount).toBe(9_650_840n)
      expect(summary?.inputTxnId).toBe(txIds[3])
      expect(summary?.launch).toBeUndefined()
    })

    describe('sell when the curve payout is unavailable', () => {
      const sellOutput = () =>
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: ROUTER_ADDRESS,
          receiver: sellFixture.address,
          amount: 1_109_343,
          assetIndex: 31566704,
          suggestedParams,
        })

      it('still reports the output when the curve call has no return value', async () => {
        const composer = createComposer(sellFixture)
        const txIds = await buildAndStubExecute(composer)
        pendingInfo[txIds[9]!] = { innerTxns: [inner(sellOutput())] }
        pendingInfo[txIds[1]!] = { logs: [] }

        await composer.execute()

        const summary = composer.getSummary()
        expect(summary?.outputAmount).toBe(1_109_343n)
        expect(summary?.launch?.curveTxnId).toBe(txIds[1])
        expect(summary?.launch?.bondingAmount).toBeUndefined()
      })

      it('still reports the output when the curve lookup fails', async () => {
        const composer = createComposer(sellFixture)
        const txIds = await buildAndStubExecute(composer)
        pendingInfo[txIds[9]!] = { innerTxns: [inner(sellOutput())] }
        mockAlgodClient.pendingTransactionInformation = vi.fn(
          (txId: string) => ({
            do: vi.fn().mockImplementation(async () => {
              if (txId === txIds[1]) throw new Error('not found')
              return pendingInfo[txId] ?? {}
            }),
          }),
        ) as any

        await composer.execute()

        const summary = composer.getSummary()
        expect(summary?.outputAmount).toBe(1_109_343n)
        expect(summary?.inputAmount).toBe(660_230_328_964n)
        expect(summary?.launch?.bondingAmount).toBeUndefined()
      })
    })

    describe('return value parsing', () => {
      it('reads the return from the last log, after event logs', async () => {
        const composer = createComposer(buyFixture)
        const txIds = await buildAndStubExecute(composer)
        const eventLog = new Uint8Array([
          ...Buffer.from('a1b2c3d4', 'hex'),
          ...algosdk.encodeUint64(1n),
          ...algosdk.encodeUint64(2n),
        ])
        pendingInfo[txIds[13]!] = {
          logs: [eventLog, returnLog(950_000n)],
          innerTxns: [],
        }

        await composer.execute()

        expect(composer.getSummary()?.outputAmount).toBe(950_000n)
      })

      it('ignores a 12-byte last log without the ARC-4 return prefix', async () => {
        const composer = createComposer(buyFixture)
        const txIds = await buildAndStubExecute(composer)
        const notAReturn = new Uint8Array([
          ...Buffer.from('deadbeef', 'hex'),
          ...algosdk.encodeUint64(950_000n),
        ])
        pendingInfo[txIds[13]!] = { logs: [notAReturn], innerTxns: [] }

        await composer.execute()

        expect(composer.getSummary()).toBeUndefined()
      })
    })

    describe('with other transactions ahead of the swap', () => {
      const sellOutput = () =>
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: ROUTER_ADDRESS,
          receiver: sellFixture.address,
          amount: 1_109_343,
          assetIndex: 31566704,
          suggestedParams,
        })

      it('locates the curve call after required app opt-ins', async () => {
        const composer = createComposer({
          ...sellFixture,
          quote: { ...sellFixture.quote, requiredAppOptIns: [123456] },
        })
        const txIds = await buildAndStubExecute(composer)
        // Index 0 is the app opt-in, so the sell fixture shifts by one
        expect(txIds).toHaveLength(11)
        pendingInfo[txIds[10]!] = { innerTxns: [inner(sellOutput())] }
        pendingInfo[txIds[2]!] = { logs: [returnLog(9_748_324n)] }

        await composer.execute()

        const summary = composer.getSummary()
        expect(summary?.inputTxnId).toBe(txIds[2])
        expect(summary?.launch?.curveTxnId).toBe(txIds[2])
        expect(summary?.launch?.bondingAmount).toBe(9_748_324n)
      })

      it('locates the curve call after a transaction added before a sell', async () => {
        const composer = createComposer(sellFixture)
        composer.addTransaction(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: sellFixture.address,
            receiver: sellFixture.address,
            amount: 0,
            suggestedParams,
          }),
        )
        const txIds = await buildAndStubExecute(composer)
        pendingInfo[txIds[10]!] = { innerTxns: [inner(sellOutput())] }
        pendingInfo[txIds[2]!] = { logs: [returnLog(9_748_324n)] }

        await composer.execute()

        const summary = composer.getSummary()
        expect(summary?.inputTxnId).toBe(txIds[2])
        expect(summary?.launch?.curveTxnId).toBe(txIds[2])
        expect(summary?.launch?.bondingAmount).toBe(9_748_324n)
      })

      it('locates the curve call after a transaction added before a buy', async () => {
        const composer = createComposer(buyFixture)
        composer.addTransaction(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: buyFixture.address,
            receiver: buyFixture.address,
            amount: 0,
            suggestedParams,
          }),
        )
        const txIds = await buildAndStubExecute(composer)
        pendingInfo[txIds[14]!] = {
          logs: [returnLog(950_000n)],
          innerTxns: [],
        }

        await composer.execute()

        const summary = composer.getSummary()
        expect(summary?.outputTxnId).toBe(txIds[14])
        expect(summary?.launch?.curveTxnId).toBe(txIds[14])
        expect(summary?.outputAmount).toBe(950_000n)
      })
    })
  })

  describe('middleware', () => {
    it('sees the normalized launch details on a raw quote', async () => {
      let seen: SwapContext['quote'] | undefined
      const composer = new SwapComposer({
        quote: sellFixture.quote as unknown as FetchQuoteResponse,
        swapTxns: sellFixture.txns as SwapTransaction[],
        algodClient: mockAlgodClient,
        address: sellFixture.address,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
        middleware: [
          {
            name: 'Capture',
            version: '1.0.0',
            shouldApply: async () => true,
            beforeSwap: async (context) => {
              seen = context.quote
              return []
            },
          },
        ],
      })

      await composer.addSwapTransactions()

      expect(seen?.launch).toEqual({
        side: 'sell',
        tokenNum: 1,
        bondingTokenId: 0,
        bondingSurplus: 97_484n,
        refund: 0n,
        graduates: false,
      })
    })
  })

  describe('buy of a token bonded in an ASA', () => {
    const user = algosdk.generateAccount().addr.toString()
    const BONDING_ASSET = 31566704
    const LAUNCH_ASSET = 3454502531
    const HAYLAUNCH_APP_ID = 3452678093n
    const ROUTER_APP_ID = 3172554435n

    const routerCall = () =>
      algosdk.makeApplicationNoOpTxnFromObject({
        sender: ROUTER_ADDRESS,
        appIndex: ROUTER_APP_ID,
        suggestedParams,
      })

    const bondingTransfer = (receiver: string, amount: number) =>
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: user,
        receiver,
        amount,
        assetIndex: BONDING_ASSET,
        suggestedParams,
      })

    /**
     * router opt-in, ALGO -> router, router swap, [beforeCurve], USDC -> curve,
     * buyWithLimit(tokenNum 7, minTokensOut), [afterCurve]
     */
    const buildBuy = ({
      beforeCurve,
      afterCurve,
    }: {
      beforeCurve?: SwapTransaction
      afterCurve?: SwapTransaction
    } = {}) => {
      const buyCall = algosdk.makeApplicationNoOpTxnFromObject({
        sender: user,
        appIndex: HAYLAUNCH_APP_ID,
        appArgs: [
          Buffer.from('9068a8d9', 'hex'),
          algosdk.encodeUint64(7),
          algosdk.encodeUint64(900_000),
        ],
        suggestedParams,
      })
      const txns = [
        toSwapTxn(routerCall(), ROUTER_SIGNATURE),
        toSwapTxn(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: user,
            receiver: ROUTER_ADDRESS,
            amount: 5_000_000,
            suggestedParams,
          }),
        ),
        toSwapTxn(routerCall(), ROUTER_SIGNATURE),
        ...(beforeCurve ? [beforeCurve] : []),
        toSwapTxn(bondingTransfer(HAYLAUNCH_ADDRESS, 1_000_000)),
        toSwapTxn(buyCall),
        ...(afterCurve ? [afterCurve] : []),
      ]
      return {
        address: user,
        quote: {
          fromASAID: 0,
          toASAID: LAUNCH_ASSET,
          quote: '1000000',
          type: 'fixed-input',
          route: [],
          txnPayload: null,
          requiredAppOptIns: [],
          launch: {
            side: 'buy',
            tokenNum: 7,
            bondingTokenId: BONDING_ASSET,
            bondingSurplus: 5000,
          },
        },
        txns,
      }
    }

    it('reports tokens credited, the bonding payment and an ASA refund', async () => {
      const fixture = buildBuy()
      const composer = createComposer(fixture)
      const txIds = await buildAndStubExecute(composer)
      const refund = (amount: number) =>
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: HAYLAUNCH_ADDRESS,
          receiver: user,
          amount,
          assetIndex: BONDING_ASSET,
          suggestedParams,
        })
      // An inner transfer of the launch token must not replace the return value
      const launchTokenTransfer =
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: ROUTER_ADDRESS,
          receiver: user,
          amount: 1,
          assetIndex: LAUNCH_ASSET,
          suggestedParams,
        })
      const otherAsset =
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: HAYLAUNCH_ADDRESS,
          receiver: user,
          amount: 42,
          assetIndex: 999,
          suggestedParams,
        })
      const algoPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: HAYLAUNCH_ADDRESS,
        receiver: user,
        amount: 7,
        suggestedParams,
      })
      pendingInfo[txIds[4]!] = {
        logs: [returnLog(950_000n)],
        innerTxns: [
          inner(refund(200_000)),
          inner(otherAsset),
          inner(algoPayment),
          inner(launchTokenTransfer),
          inner(refund(50_000)),
        ],
      }

      await composer.execute()

      expect(composer.getSummary()).toMatchObject({
        inputAmount: 5_000_000n,
        outputAmount: 950_000n,
        inputTxnId: txIds[1],
        outputTxnId: txIds[4],
        outputSender: HAYLAUNCH_ADDRESS,
        launch: {
          side: 'buy',
          tokenNum: 7n,
          curveTxnId: txIds[4],
          bondingAmount: 1_000_000n,
          refund: 250_000n,
        },
      })
    })

    it('locates the user-signed curve call, not a pre-signed call with a curve selector', async () => {
      const presigned = algosdk.makeApplicationNoOpTxnFromObject({
        sender: ROUTER_ADDRESS,
        appIndex: HAYLAUNCH_APP_ID,
        appArgs: [Buffer.from('b0e30517', 'hex'), algosdk.encodeUint64(7)],
        suggestedParams,
      })
      const fixture = buildBuy({
        beforeCurve: toSwapTxn(presigned, ROUTER_SIGNATURE),
      })
      const composer = createComposer(fixture)
      const txIds = await buildAndStubExecute(composer)
      pendingInfo[txIds[5]!] = { logs: [returnLog(950_000n)], innerTxns: [] }

      await composer.execute()

      const summary = composer.getSummary()
      expect(summary?.outputTxnId).toBe(txIds[5])
      expect(summary?.launch?.curveTxnId).toBe(txIds[5])
      expect(summary?.outputAmount).toBe(950_000n)
    })

    it('reads the output from the curve call even when it is not last', async () => {
      const fixture = buildBuy({
        afterCurve: toSwapTxn(routerCall(), ROUTER_SIGNATURE),
      })
      const composer = createComposer(fixture)
      const txIds = await buildAndStubExecute(composer)
      pendingInfo[txIds[4]!] = { logs: [returnLog(950_000n)], innerTxns: [] }
      pendingInfo[txIds[5]!] = { logs: [returnLog(1n)], innerTxns: [] }

      await composer.execute()

      const summary = composer.getSummary()
      expect(summary?.outputAmount).toBe(950_000n)
      expect(summary?.outputTxnId).toBe(txIds[4])
    })

    it('leaves the bonding amount undefined when the curve payment is not right before the buy', async () => {
      const stray = toSwapTxn(bondingTransfer(user, 1))
      const fixture = buildBuy()
      // Swap the bonding payment for a transfer that isn't to the curve
      fixture.txns.splice(3, 1, stray)
      const composer = createComposer(fixture)
      const txIds = await buildAndStubExecute(composer)
      pendingInfo[txIds[4]!] = { logs: [returnLog(950_000n)], innerTxns: [] }

      await composer.execute()

      const summary = composer.getSummary()
      expect(summary?.outputAmount).toBe(950_000n)
      expect(summary?.launch?.bondingAmount).toBeUndefined()
    })
  })
})

describe('SwapComposer input transaction selection', () => {
  const user = algosdk.generateAccount().addr.toString()
  const routerAppId = 123456n
  const routerAddress = algosdk.getApplicationAddress(routerAppId).toString()

  const routerAppCall = () =>
    toSwapTxn(
      algosdk.makeApplicationNoOpTxnFromObject({
        sender: routerAddress,
        appIndex: routerAppId,
        suggestedParams,
      }),
      ROUTER_SIGNATURE,
    )
  const userPayTo = (receiver: string) =>
    toSwapTxn(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: user,
        receiver,
        amount: 5_000_000,
        suggestedParams,
      }),
    )
  const userOptIn = () =>
    toSwapTxn(
      algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: user,
        receiver: user,
        amount: 0,
        assetIndex: 31566704,
        suggestedParams,
      }),
    )
  const userAppCall = () =>
    toSwapTxn(
      algosdk.makeApplicationNoOpTxnFromObject({
        sender: user,
        appIndex: 999n,
        suggestedParams,
      }),
    )

  /** Index of getInputTransactionId() within the built group */
  const inputIndexOf = async (swapTxns: SwapTransaction[]) => {
    const composer = new SwapComposer({
      quote: {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: null,
        requiredAppOptIns: [],
      } as unknown as FetchQuoteResponse,
      swapTxns,
      algodClient: {
        accountInformation: vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({ appsLocalState: [], assets: [] }),
        }),
      } as any,
      address: user,
      signer: async (txns: algosdk.Transaction[]) =>
        txns.map(() => new Uint8Array(0)),
    })
    await composer.addSwapTransactions()
    const ids = composer.buildGroup().map(({ txn }) => txn.txID())
    return ids.indexOf(composer.getInputTransactionId()!)
  }

  it('finds the router from its pre-signed call, not an earlier user-signed app call', async () => {
    expect(
      await inputIndexOf([
        userAppCall(),
        routerAppCall(),
        userPayTo(routerAddress),
        userOptIn(),
      ]),
    ).toBe(2)
  })

  it('finds the router from its app call, not an earlier pre-signed payment', async () => {
    const routerPayment = toSwapTxn(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: routerAddress,
        receiver: user,
        amount: 0,
        suggestedParams,
      }),
      ROUTER_SIGNATURE,
    )
    expect(
      await inputIndexOf([
        routerPayment,
        routerAppCall(),
        userPayTo(routerAddress),
        userOptIn(),
      ]),
    ).toBe(2)
  })

  it('picks a transfer to the router at index 0', async () => {
    expect(
      await inputIndexOf([
        userPayTo(routerAddress),
        routerAppCall(),
        userOptIn(),
      ]),
    ).toBe(0)
  })

  it('falls back to the last user-signed transaction without a router call', async () => {
    expect(await inputIndexOf([userPayTo(user), userOptIn()])).toBe(1)
  })

  it('falls back to the last user-signed transaction when nothing is sent to the router', async () => {
    expect(
      await inputIndexOf([routerAppCall(), userOptIn(), userPayTo(user)]),
    ).toBe(2)
  })

  it('skips a pre-signed transfer to the router', async () => {
    const presignedToRouter = toSwapTxn(
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: routerAddress,
        receiver: routerAddress,
        amount: 0,
        suggestedParams,
      }),
      ROUTER_SIGNATURE,
    )
    expect(
      await inputIndexOf([
        routerAppCall(),
        presignedToRouter,
        userPayTo(routerAddress),
      ]),
    ).toBe(2)
  })

  it('picks the transfer to the router over a later user-signed transaction', async () => {
    const routerCall = algosdk.makeApplicationNoOpTxnFromObject({
      sender: routerAddress,
      appIndex: routerAppId,
      suggestedParams,
    })
    const input = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: routerAddress,
      amount: 5_000_000,
      suggestedParams,
    })
    const optIn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: user,
      amount: 0,
      assetIndex: 31566704,
      suggestedParams,
    })
    const note = new TextEncoder().encode('tracking')

    const composer = new SwapComposer({
      quote: {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: null,
        requiredAppOptIns: [],
      } as unknown as FetchQuoteResponse,
      swapTxns: [
        toSwapTxn(routerCall, ROUTER_SIGNATURE),
        toSwapTxn(input),
        toSwapTxn(optIn),
      ],
      algodClient: {
        accountInformation: vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({ appsLocalState: [], assets: [] }),
        }),
      } as any,
      address: user,
      signer: async (txns: algosdk.Transaction[]) =>
        txns.map(() => new Uint8Array(0)),
      note,
    })

    await composer.addSwapTransactions()
    const txns = composer.buildGroup()

    expect(composer.getInputTransactionId()).toBe(txns[1]?.txn.txID())
    expect(txns[1]?.txn.note).toEqual(note)
    expect(txns[2]?.txn.note).not.toEqual(note)
  })
})
