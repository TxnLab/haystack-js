import algosdk from 'algosdk'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RouterClient } from '../src/client'
import { SwapComposer } from '../src/composer'
import { FALCON_EXTRA_FEE } from '../src/constants'
import type { SwapMiddleware } from '../src/middleware'
import type {
  FetchQuoteResponse,
  SignerType,
  SwapQuote,
  SwapTransaction,
} from '../src/types'

vi.mock('../src/utils', () => ({
  request: vi.fn(),
  HTTPError: class HTTPError extends Error {},
}))

/**
 * A Falcon (post-quantum) signature costs 3 fee units, so a Falcon signer's
 * input transfer carries FALCON_EXTRA_FEE more fee for each transaction the
 * account sends. The router includes it for the transactions it builds when
 * execute's response says so; the composer adds it for the rest.
 */

const V4_APP = 3757715482n
const USDC = 31566704n
const ROUTER = algosdk.getApplicationAddress(V4_APP).toString()

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

const userAccount = algosdk.generateAccount()
const user = userAccount.addr.toString()
const hotWallet = algosdk.generateAccount()
const other = algosdk.generateAccount().addr.toString()

const encode = (
  txn: algosdk.Transaction,
  signature: SwapTransaction['signature'] = false,
): SwapTransaction => ({
  data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'),
  group: '',
  logicSigBlob: false,
  signature,
})

const pay = (sender: string, receiver: string, note: string, fee = 0) =>
  algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver,
    amount: 100_000,
    suggestedParams: { ...suggestedParams, fee, flatFee: true },
    note: new TextEncoder().encode(note),
  })

const routerCall = (note: string) =>
  encode(
    algosdk.makeApplicationNoOpTxnFromObject({
      sender: hotWallet.addr,
      appIndex: V4_APP,
      suggestedParams: { ...suggestedParams, fee: 0, flatFee: true },
      note: new TextEncoder().encode(note),
    }),
    { type: 'secret_key', value: { ...hotWallet.sk } },
  )

/** INPUT_FEE: the router's fee budget on the input transfer */
const INPUT_FEE = 9000n

/**
 * A v4 USDC→ALGO group: the opt_in pair (the router lacks USDC), the funding
 * payment, the input and the route. The user sends three of them.
 */
const v4Group = (): SwapTransaction[] => [
  encode(pay(user, ROUTER, 'opt-in')),
  routerCall('opt_in'),
  encode(pay(user, ROUTER, 'route-costs')),
  encode(
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: ROUTER,
      amount: 1_000_000,
      assetIndex: USDC,
      suggestedParams: {
        ...suggestedParams,
        fee: Number(INPUT_FEE),
        flatFee: true,
      },
    }),
  ),
  routerCall('route'),
]
const V4_USER_TXNS = 3n
const ALL_INCLUDED = INPUT_FEE + FALCON_EXTRA_FEE * V4_USER_TXNS

const quote = (requiredAppOptIns: number[] = []) =>
  ({
    fromASAID: Number(USDC),
    toASAID: 0,
    quote: '5000000',
    type: 'fixed-input',
    route: [],
    flattenedRoute: {},
    txnPayload: { iv: 'iv', data: 'data' },
    requiredAppOptIns,
  }) as unknown as FetchQuoteResponse

/** quote() as a SwapQuote, the way an app spreads a fetchQuote() response */
const swapQuote = (extra: Partial<SwapQuote> = {}): SwapQuote => ({
  ...(quote() as unknown as Omit<SwapQuote, 'quote' | 'amount' | 'createdAt'>),
  quote: 5_000_000n,
  amount: 1_000_000n,
  createdAt: Date.now(),
  ...extra,
})

const isInput = (t: algosdk.Transaction) =>
  t.type === algosdk.TransactionType.axfer &&
  t.assetTransfer?.receiver.toString() === ROUTER

const noSigs = async (txns: algosdk.Transaction[], idx: number[]) =>
  idx.map(() => new Uint8Array(0))

let algod: algosdk.Algodv2
let pending: Record<string, unknown>

beforeEach(() => {
  pending = {}
  algod = {
    accountInformation: vi.fn().mockReturnValue({
      do: vi.fn().mockResolvedValue({ appsLocalState: [], assets: [] }),
    }),
    getTransactionParams: vi.fn().mockReturnValue({
      do: vi.fn().mockResolvedValue(suggestedParams),
    }),
    pendingTransactionInformation: vi.fn((txId: string) => ({
      do: vi.fn().mockResolvedValue(pending[txId] ?? {}),
    })),
    sendRawTransaction: vi.fn().mockReturnValue({
      do: vi.fn().mockResolvedValue({ txid: 'sent' }),
    }),
  } as unknown as algosdk.Algodv2
})

const composer = (
  opts: {
    quote?: FetchQuoteResponse | SwapQuote
    signerType?: SignerType
    signerFeesIncluded?: boolean
    requiredAppOptIns?: number[]
    middleware?: SwapMiddleware[]
    signer?: algosdk.TransactionSigner
  } = {},
) =>
  new SwapComposer({
    quote: opts.quote ?? quote(opts.requiredAppOptIns),
    swapTxns: v4Group(),
    algodClient: algod,
    address: user,
    signer: opts.signer ?? noSigs,
    signerType: opts.signerType,
    signerFeesIncluded: opts.signerFeesIncluded,
    middleware: opts.middleware,
  })

/** The built group's input transfer, and every other transaction's fee */
const built = (c: SwapComposer) => {
  const txns = c.buildGroup().map(({ txn }) => txn)
  const input = txns.find(isInput)
  if (!input) throw new Error('no input transfer')
  return { input, others: txns.filter((t) => t !== input).map((t) => t.fee) }
}

/** A middleware adding a payment from sender in hook */
const paying = (
  sender: string,
  hook: 'beforeSwap' | 'afterSwap' = 'beforeSwap',
): SwapMiddleware => ({
  name: 'paying',
  version: '1.0.0',
  shouldApply: async () => true,
  [hook]: async (ctx: { signer: algosdk.TransactionSigner }) => [
    { txn: pay(sender, other, hook, 1000), signer: ctx.signer },
  ],
})

describe('Falcon signer fees', () => {
  it('leaves an ed25519 signer’s fees alone', async () => {
    const c = composer()
    await c.addSwapTransactions()
    const { input, others } = built(c)
    expect(input.fee).toBe(INPUT_FEE)
    expect(others).toEqual([0n, 0n, 0n, 0n])
  })

  it('adds them for every user transaction when the router did not', async () => {
    const c = composer({ signerType: 'falcon' })
    await c.addSwapTransactions()
    const { input, others } = built(c)
    // 2,000 µALGO each: a Falcon signature is 3 fee units, not 1
    expect(input.fee).toBe(9_000n + 3n * 2_000n)
    // the fee goes on the input alone
    expect(others).toEqual([0n, 0n, 0n, 0n])
  })

  it('adds them only for what the composer adds when the router included them', async () => {
    const c = composer({ signerType: 'falcon', signerFeesIncluded: true })
    await c.addSwapTransactions()
    expect(built(c).input.fee).toBe(INPUT_FEE)
  })

  it('takes the signer type from the quote when not given', async () => {
    const c = composer({ quote: { ...quote(), signerType: 'falcon' } })
    await c.addSwapTransactions()
    expect(built(c).input.fee).toBe(ALL_INCLUDED)
  })

  it('counts app opt-ins, middleware and added transactions from the account', async () => {
    const c = composer({
      signerType: 'falcon',
      signerFeesIncluded: true,
      requiredAppOptIns: [1002541853],
      // the other account's payments aren't signed by the user's Falcon key
      middleware: [
        paying(user),
        paying(other),
        paying(user, 'afterSwap'),
        paying(other, 'afterSwap'),
      ],
    })
    c.addTransaction(pay(user, other, 'before', 1000))
    c.addTransaction(pay(other, user, 'before, other', 1000))
    await c.addSwapTransactions()
    c.addTransaction(pay(user, other, 'after', 1000))
    // opt-in, two middleware payments, two added payments
    expect(built(c).input.fee).toBe(INPUT_FEE + FALCON_EXTRA_FEE * 5n)
  })

  it.each([
    ['from the account with its argument', user, user, 2n],
    ['from another account, its argument the account’s', other, user, 1n],
    ['and its argument from another account', other, other, 0n],
  ])('counts a method call %s', async (_, sender, argSender, counted) => {
    const method = algosdk.ABIMethod.fromSignature('deposit(pay)void')
    const c = composer({ signerType: 'falcon', signerFeesIncluded: true })
    c.addMethodCall({
      appID: 123,
      method,
      methodArgs: [
        {
          txn: pay(
            argSender,
            algosdk.getApplicationAddress(123n).toString(),
            'arg',
          ),
          signer: algosdk.makeEmptyTransactionSigner(),
        },
      ],
      sender,
      suggestedParams,
    })
    await c.addSwapTransactions()
    expect(built(c).input.fee).toBe(INPUT_FEE + FALCON_EXTRA_FEE * counted)
  })

  it('puts them on the account’s first transaction when there is no swap', () => {
    const c = composer({ signerType: 'falcon' })
    c.addTransaction(pay(other, user, 'other', 1000))
    c.addTransaction(pay(user, other, 'first', 1000))
    c.addTransaction(pay(user, other, 'second', 1000))
    const fees = c.buildGroup().map(({ txn }) => txn.fee)
    expect(fees).toEqual([1000n, 1000n + FALCON_EXTRA_FEE * 2n, 1000n])
  })

  it('puts them on a method call’s transaction argument when it is the account’s first', () => {
    const c = composer({ signerType: 'falcon' })
    c.addMethodCall({
      appID: 123,
      method: algosdk.ABIMethod.fromSignature('deposit(pay)void'),
      methodArgs: [
        {
          txn: pay(user, algosdk.getApplicationAddress(123n).toString(), 'arg'),
          signer: algosdk.makeEmptyTransactionSigner(),
        },
      ],
      sender: user,
      suggestedParams,
    })
    // the argument and the call
    expect(c.buildGroup()[0]!.txn.fee).toBe(FALCON_EXTRA_FEE * 2n)
  })

  it('throws without a transaction to carry them, then adds them once one is there', async () => {
    const c = composer({ signerType: 'falcon' })
    c.addMethodCall({
      appID: 123,
      method: algosdk.ABIMethod.fromSignature('noop()void'),
      methodArgs: [],
      sender: user,
      suggestedParams,
    })
    expect(() => c.buildGroup()).toThrow('to carry its Falcon signature fees')
    await c.addSwapTransactions()
    // the method call and the router's three
    expect(built(c).input.fee).toBe(INPUT_FEE + FALCON_EXTRA_FEE * 4n)
  })

  it('adds the fees once, however often the group is built', async () => {
    const c = composer({ signerType: 'falcon' })
    await c.addSwapTransactions()
    c.buildGroup()
    c.buildGroup()
    expect(built(c).input.fee).toBe(ALL_INCLUDED)
    // the group ID covers the raised fee
    const txns = c.buildGroup().map(({ txn }) => txn)
    const group = txns[0]!.group
    const fresh = txns.map((t) => {
      const copy = algosdk.decodeUnsignedTransaction(
        algosdk.encodeUnsignedTransaction(t),
      )
      copy.group = undefined
      return copy
    })
    expect(algosdk.computeGroupID(fresh)).toEqual(group)
  })

  it.each(['sign', 'submit'] as const)(
    'adds them before %s() hands the group to the signer',
    async (method) => {
      let fee: bigint | undefined
      const c = composer({
        signerType: 'falcon',
        signer: async (txns, idx) => {
          fee = txns.find(isInput)?.fee
          return idx.map(
            (i) => algosdk.signTransaction(txns[i]!, userAccount.sk).blob,
          )
        },
      })
      await c[method]()
      expect(fee).toBe(ALL_INCLUDED)
    },
  )

  it('adds them before execute() submits, and the summary counts them', async () => {
    const c = composer({ signerType: 'falcon' })
    await c.addSwapTransactions()
    const atc = (c as unknown as { atc: algosdk.AtomicTransactionComposer }).atc
    let fee: bigint | undefined
    vi.spyOn(atc, 'execute').mockImplementation(async () => {
      const txns = atc.buildGroup().map(({ txn }) => txn)
      fee = txns.find(isInput)?.fee
      const txIDs = txns.map((t) => t.txID())
      pending[txIDs[txIDs.length - 1]!] = {
        innerTxns: [
          {
            txn: {
              txn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                sender: ROUTER,
                receiver: user,
                amount: 5_000_000,
                suggestedParams,
              }),
            },
          },
        ],
      }
      return { confirmedRound: 1n, txIDs, methodResults: [] }
    })
    await c.execute()
    expect(fee).toBe(ALL_INCLUDED)
    expect(c.getSummary()?.totalFees).toBe(ALL_INCLUDED)
  })

  it('shows middleware the signer type it composes for', async () => {
    let seen: SignerType | undefined
    const c = composer({
      quote: swapQuote({ signerType: 'ed25519' }),
      signerType: 'falcon',
      middleware: [
        {
          name: 'watching',
          version: '1.0.0',
          shouldApply: async () => true,
          beforeSwap: async (ctx) => {
            seen = ctx.quote.signerType
            return []
          },
        },
      ],
    })
    await c.addSwapTransactions()
    expect(seen).toBe('falcon')
  })
})

describe('RouterClient signerType', () => {
  let mockRequest: ReturnType<typeof vi.fn>
  let client: RouterClient

  beforeEach(async () => {
    client = new RouterClient({ apiKey: 'test-api-key' })
    const utils = vi.mocked(await import('../src/utils'), { partial: true })
    mockRequest = utils.request as ReturnType<typeof vi.fn>
    mockRequest.mockReset()
  })

  const params = { fromASAID: USDC, toASAID: 0, amount: 1_000_000n }
  const sentSignerType = () =>
    new URL(mockRequest.mock.calls[0]?.[0] as string).searchParams.get(
      'signerType',
    )

  it('asks for a Falcon signer', async () => {
    mockRequest.mockResolvedValueOnce({ ...quote(), signerType: 'falcon' })
    const q = await client.newQuote({ ...params, signerType: 'falcon' })
    expect(sentSignerType()).toBe('falcon')
    expect(q.signerType).toBe('falcon')
  })

  it('sends nothing for ed25519', async () => {
    mockRequest.mockResolvedValueOnce(quote())
    const q = await client.newQuote({ ...params, signerType: 'ed25519' })
    expect(sentSignerType()).toBeNull()
    expect(q.signerType).toBe('ed25519')
  })

  it('keeps the caller’s signer type when a middleware’s params leave it out', async () => {
    client = new RouterClient({
      apiKey: 'test-api-key',
      middleware: [
        {
          name: 'rebuilding',
          version: '1.0.0',
          shouldApply: async () => true,
          adjustQuoteParams: async (p) => ({
            fromASAID: p.fromASAID,
            toASAID: p.toASAID,
            amount: p.amount,
          }),
        },
      ],
    })
    mockRequest.mockResolvedValueOnce(quote())
    const q = await client.newQuote({ ...params, signerType: 'falcon' })
    expect(sentSignerType()).toBeNull()
    expect(q.signerType).toBe('falcon')
  })

  it('rejects an unknown signer type', async () => {
    await expect(
      client.fetchQuote({ ...params, signerType: 'pqsig' as SignerType }),
    ).rejects.toThrow('Invalid signerType')
  })

  /** newSwap on q, execute's response saying signerType or not, built */
  const swapFee = async (
    q: FetchQuoteResponse | SwapQuote,
    executeSays: 'falcon' | undefined,
    override?: SignerType,
  ) => {
    mockRequest.mockResolvedValueOnce({
      txns: v4Group(),
      ...(executeSays && { signerType: executeSays }),
    })
    const swap = await client.newSwap({
      quote: q,
      address: user,
      slippage: 1,
      signer: noSigs,
      signerType: override,
    })
    await swap.addSwapTransactions()
    return built(swap).input.fee
  }

  it.each([
    [
      'a fetchQuote() echo, execute including them',
      () => ({ ...quote(), signerType: 'falcon' }) as FetchQuoteResponse,
      'falcon',
      undefined,
      INPUT_FEE,
    ],
    [
      'a fetchQuote() echo, execute not (a pod mid-rollout)',
      () => ({ ...quote(), signerType: 'falcon' }) as FetchQuoteResponse,
      undefined,
      undefined,
      ALL_INCLUDED,
    ],
    [
      'an older router’s fetchQuote() with signerType passed to newSwap()',
      quote,
      undefined,
      'falcon',
      ALL_INCLUDED,
    ],
    ['an ed25519 fetchQuote()', quote, undefined, undefined, INPUT_FEE],
    [
      'a spread fetchQuote() echo as a SwapQuote, execute including them',
      () => swapQuote({ signerType: 'falcon' }),
      'falcon',
      undefined,
      INPUT_FEE,
    ],
    [
      'a SwapQuote from before signerType',
      () => swapQuote(),
      undefined,
      undefined,
      INPUT_FEE,
    ],
  ] as const)(
    'adds the right fees on %s',
    async (_, q, executeSays, override, want) => {
      expect(await swapFee(q(), executeSays, override)).toBe(want)
    },
  )

  it.each([
    ['including them', 'falcon', INPUT_FEE],
    ['not', undefined, ALL_INCLUDED],
  ] as const)(
    'adds the right fees from newQuote() through newSwap(), execute %s',
    async (_, executeSays, want) => {
      mockRequest.mockResolvedValueOnce({ ...quote(), signerType: 'falcon' })
      const q = await client.newQuote({ ...params, signerType: 'falcon' })
      expect(await swapFee(q, executeSays)).toBe(want)
    },
  )

  it('lets newSwap() override an ed25519 newQuote()', async () => {
    mockRequest.mockResolvedValueOnce(quote())
    const q = await client.newQuote(params)
    expect(q.signerType).toBe('ed25519')
    expect(await swapFee(q, undefined, 'falcon')).toBe(ALL_INCLUDED)
  })
})
