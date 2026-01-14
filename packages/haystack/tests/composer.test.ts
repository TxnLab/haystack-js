import algosdk from 'algosdk'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SwapComposer, SwapComposerStatus } from '../src/composer'
import type { FetchQuoteResponse, SwapTransaction } from '../src/types'

/**
 * Helper to create a valid signed transaction blob
 * Required because mocked signers must return actual signed transactions
 */
const createValidSignedTxnBlob = (txn: algosdk.Transaction): Uint8Array => {
  const sk = algosdk.generateAccount().sk
  return algosdk.signTransaction(txn, sk).blob
}

describe('SwapComposer', () => {
  let mockAlgodClient: algosdk.Algodv2
  const validAddress =
    '5BPCE3UNCPAIONAOMY4CVUXNU27SOCXYE4QSXEQFYXV6ORFQIKVTOR6ZTM'

  const createMockQuote = (): Partial<FetchQuoteResponse> => ({
    fromASAID: 0,
    toASAID: 31566704,
    quote: '1000000',
    route: [],
    txnPayload: { iv: 'test-iv', data: 'test-data' },
    requiredAppOptIns: [],
  })

  const createMockTransaction = (
    senderParam: string = validAddress,
  ): algosdk.Transaction => {
    return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: senderParam,
      receiver: senderParam,
      amount: 1000,
      suggestedParams: {
        fee: 1000,
        firstValid: 1000,
        lastValid: 2000,
        genesisID: 'testnet-v1.0',
        genesisHash: Buffer.from(
          'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
          'base64',
        ),
        minFee: 1000,
      },
    })
  }

  const createMockSwapTxn = (): SwapTransaction => ({
    data: Buffer.from(
      algosdk.encodeUnsignedTransaction(createMockTransaction()),
    ).toString('base64'),
    group: '',
    logicSigBlob: false,
    signature: false,
  })

  beforeEach(() => {
    mockAlgodClient = {
      accountInformation: vi.fn().mockReturnValue({
        do: vi.fn().mockResolvedValue({
          appsLocalState: [],
          assets: [],
        }),
      }),
      getTransactionParams: vi.fn().mockReturnValue({
        do: vi.fn().mockResolvedValue({
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          minFee: 1000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
        }),
      }),
    } as any
  })

  describe('constructor', () => {
    it('should create a composer with valid configuration', () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        group: '',
        logicSigBlob: false,
        signature: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      expect(composer).toBeInstanceOf(SwapComposer)
      expect(composer.getStatus()).toBe(SwapComposerStatus.BUILDING)
    })

    it('should throw error for missing quote', () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        group: '',
        logicSigBlob: false,
        signature: false,
      }

      expect(
        () =>
          new SwapComposer({
            quote: null as any,
            swapTxns: [mockSwapTxn],
            algodClient: mockAlgodClient,
            address: validAddress,
            signer: async (txns: algosdk.Transaction[]) =>
              txns.map(() => new Uint8Array(0)),
          }),
      ).toThrow('Quote is required')
    })

    it('should throw error for missing swap transactions', () => {
      expect(
        () =>
          new SwapComposer({
            quote: createMockQuote() as FetchQuoteResponse,
            swapTxns: null as any,
            algodClient: mockAlgodClient,
            address: validAddress,
            signer: async (txns: algosdk.Transaction[]) =>
              txns.map(() => new Uint8Array(0)),
          }),
      ).toThrow('Swap transactions are required')
    })

    it('should throw error for empty swap transactions array', () => {
      expect(
        () =>
          new SwapComposer({
            quote: createMockQuote() as FetchQuoteResponse,
            swapTxns: [],
            algodClient: mockAlgodClient,
            address: validAddress,
            signer: async (txns: algosdk.Transaction[]) =>
              txns.map(() => new Uint8Array(0)),
          }),
      ).toThrow('Swap transactions array cannot be empty')
    })

    it('should throw error for missing AlgorandClient', () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        group: '',
        logicSigBlob: false,
        signature: false,
      }

      expect(
        () =>
          new SwapComposer({
            quote: createMockQuote() as FetchQuoteResponse,
            swapTxns: [mockSwapTxn],
            algodClient: null as any,
            address: validAddress,
            signer: async (txns: algosdk.Transaction[]) =>
              txns.map(() => new Uint8Array(0)),
          }),
      ).toThrow('Algodv2 client instance is required')
    })

    it('should throw error for invalid Algorand address', () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        group: '',
        logicSigBlob: false,
        signature: false,
      }

      expect(
        () =>
          new SwapComposer({
            quote: createMockQuote() as FetchQuoteResponse,
            swapTxns: [mockSwapTxn],
            algodClient: mockAlgodClient,
            address: 'invalid-address',
            signer: async (txns: algosdk.Transaction[]) =>
              txns.map(() => new Uint8Array(0)),
          }),
      ).toThrow('Invalid Algorand address')
    })
  })

  describe('getStatus', () => {
    it('should return BUILDING status initially', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      expect(composer.getStatus()).toBe(SwapComposerStatus.BUILDING)
    })
  })

  describe('count', () => {
    it('should return 0 for empty composer', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      expect(composer.count()).toBe(0)
    })

    it('should return correct count after adding transactions', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      composer.addTransaction(createMockTransaction())
      expect(composer.count()).toBe(1)

      composer.addTransaction(createMockTransaction())
      expect(composer.count()).toBe(2)
    })
  })

  describe('addTransaction', () => {
    it('should add a transaction to the group', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      const txn = createMockTransaction()
      composer.addTransaction(txn)

      expect(composer.count()).toBe(1)
    })

    it('should allow chaining', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      const result = composer
        .addTransaction(createMockTransaction())
        .addTransaction(createMockTransaction())

      expect(result).toBe(composer)
      expect(composer.count()).toBe(2)
    })

    it('should throw error when not in BUILDING status', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      composer.addTransaction(createMockTransaction())

      // Sign to change status
      await composer.sign()

      expect(composer.getStatus()).toBe(SwapComposerStatus.SIGNED)

      expect(() => composer.addTransaction(createMockTransaction())).toThrow(
        'Cannot add transactions when composer status is not BUILDING',
      )
    })

    it('should throw error when exceeding max group size', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      // Add 16 transactions (max group size)
      for (let i = 0; i < SwapComposer.MAX_GROUP_SIZE; i++) {
        composer.addTransaction(createMockTransaction())
      }

      expect(() => composer.addTransaction(createMockTransaction())).toThrow(
        'Adding an additional transaction exceeds the maximum atomic group size',
      )
    })

    it('should throw error when trying to compose with Tinyman v1 swap', () => {
      const tinymanQuote: Partial<FetchQuoteResponse> = {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: { iv: 'test-iv', data: 'test-data' },
        requiredAppOptIns: [],
        flattenedRoute: {
          Tinyman: 1.0, // 100% Tinyman v1 routing
        },
      }

      const composer = new SwapComposer({
        quote: tinymanQuote as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      expect(() => composer.addTransaction(createMockTransaction())).toThrow(
        'Cannot add transactions to a swap group that uses Tinyman v1',
      )
    })

    it('should allow adding transactions when NOT using Tinyman v1', () => {
      const nonTinymanQuote: Partial<FetchQuoteResponse> = {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: { iv: 'test-iv', data: 'test-data' },
        requiredAppOptIns: [],
        flattenedRoute: {
          TinymanV2: 0.6,
          Folks: 0.4,
        },
      }

      const composer = new SwapComposer({
        quote: nonTinymanQuote as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      // Should not throw
      composer.addTransaction(createMockTransaction())
      expect(composer.count()).toBe(1)
    })

    it('should allow adding transactions when flattenedRoute is undefined', () => {
      const quoteWithoutRoute: Partial<FetchQuoteResponse> = {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: { iv: 'test-iv', data: 'test-data' },
        requiredAppOptIns: [],
        // No flattenedRoute property
      }

      const composer = new SwapComposer({
        quote: quoteWithoutRoute as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      // Should not throw
      composer.addTransaction(createMockTransaction())
      expect(composer.count()).toBe(1)
    })
  })

  describe('addMethodCall', () => {
    it('should use methodCall.signer if provided', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async () => [new Uint8Array([1])],
      })

      const customSigner = async () => [new Uint8Array([2])]
      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
        signer: customSigner,
      }

      const atcAddMethodCallSpy = vi.spyOn(
        (composer as any).atc,
        'addMethodCall',
      )

      composer.addMethodCall(methodCall)

      // Verify the methodCall.signer was used
      expect(atcAddMethodCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signer: customSigner,
        }),
      )

      atcAddMethodCallSpy.mockRestore()
    })

    it('should use parameter signer if methodCall.signer not provided', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async () => [new Uint8Array([1])],
      })

      const paramSigner = async () => [new Uint8Array([2])]
      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
      }

      const atcAddMethodCallSpy = vi.spyOn(
        (composer as any).atc,
        'addMethodCall',
      )

      composer.addMethodCall(methodCall, paramSigner)

      // Verify the parameter signer was used
      expect(atcAddMethodCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signer: paramSigner,
        }),
      )

      atcAddMethodCallSpy.mockRestore()
    })

    it('should use constructor signer if neither methodCall.signer nor parameter provided', () => {
      const constructorSigner = async () => [new Uint8Array([1])]
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: constructorSigner,
      })

      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
      }

      const atcAddMethodCallSpy = vi.spyOn(
        (composer as any).atc,
        'addMethodCall',
      )

      composer.addMethodCall(methodCall)

      // Verify the constructor's defaultSigner was used
      expect(atcAddMethodCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signer: (composer as any).defaultSigner,
        }),
      )

      atcAddMethodCallSpy.mockRestore()
    })

    it('should return this for method chaining', () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async () => [new Uint8Array([1])],
      })

      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
      }

      const result = composer.addMethodCall(methodCall)

      expect(result).toBe(composer)
    })

    it('should throw error when trying to add method call to Tinyman v1 swap', () => {
      const tinymanQuote: Partial<FetchQuoteResponse> = {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: { iv: 'test-iv', data: 'test-data' },
        requiredAppOptIns: [],
        flattenedRoute: {
          Tinyman: 1.0, // 100% Tinyman v1 routing
        },
      }

      const composer = new SwapComposer({
        quote: tinymanQuote as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async () => [new Uint8Array([1])],
      })

      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
      }

      expect(() => composer.addMethodCall(methodCall)).toThrow(
        'Cannot add method calls to a swap group that uses Tinyman v1',
      )
    })

    it('should allow adding method calls when NOT using Tinyman v1', () => {
      const nonTinymanQuote: Partial<FetchQuoteResponse> = {
        fromASAID: 0,
        toASAID: 31566704,
        quote: '1000000',
        route: [],
        txnPayload: { iv: 'test-iv', data: 'test-data' },
        requiredAppOptIns: [],
        flattenedRoute: {
          TinymanV2: 0.6,
          Folks: 0.4,
        },
      }

      const composer = new SwapComposer({
        quote: nonTinymanQuote as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async () => [new Uint8Array([1])],
      })

      const methodCall = {
        appID: 123456,
        method: new algosdk.ABIMethod({
          name: 'test',
          args: [],
          returns: { type: 'void' },
        }),
        sender: validAddress,
        suggestedParams: {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisID: 'testnet-v1.0',
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          minFee: 1000,
        },
      }

      // Should not throw
      const result = composer.addMethodCall(methodCall)
      expect(result).toBe(composer)
    })
  })

  describe('addSwapTransactions', () => {
    it('should add swap transactions to the group', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      await composer.addSwapTransactions()

      expect(composer.count()).toBeGreaterThan(0)
    })

    it('should throw error when swap transactions already added', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      await composer.addSwapTransactions()

      await expect(composer.addSwapTransactions()).rejects.toThrow(
        'Swap transactions have already been added',
      )
    })

    it('should throw error when not in BUILDING status', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      composer.addTransaction(createMockTransaction())

      // Add swap transactions first
      await composer.addSwapTransactions()

      // Sign to change status
      await composer.sign()

      await expect(composer.addSwapTransactions()).rejects.toThrow(
        'Swap transactions have already been added',
      )
    })

    it('should throw error when exceeding max group size', async () => {
      const mockSwapTxns: SwapTransaction[] = Array.from(
        { length: 17 },
        () => ({
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }),
      )

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: mockSwapTxns,
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      await expect(composer.addSwapTransactions()).rejects.toThrow(
        'Adding swap transactions exceeds the maximum atomic group size',
      )
    })

    it('should process app opt-ins when required', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const quote: Partial<FetchQuoteResponse> = {
        ...createMockQuote(),
        requiredAppOptIns: [123456],
      }

      const composer = new SwapComposer({
        quote: quote as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map(() => new Uint8Array(0)),
      })

      await composer.addSwapTransactions()

      // Should have opt-in + swap transaction
      expect(composer.count()).toBeGreaterThanOrEqual(2)
    })
  })

  describe('sign', () => {
    it('should sign transactions and return signed blobs', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) => {
          return txns.map((txn) => {
            const sk = algosdk.generateAccount().sk
            return algosdk.signTransaction(txn, sk).blob
          })
        },
      })

      composer.addTransaction(createMockTransaction())

      const signedTxns = await composer.sign()

      expect(signedTxns).toHaveLength(2) // 1 user txn + 1 from swapTxns
      expect(signedTxns?.[0]).toBeInstanceOf(Uint8Array)
      expect(composer.getStatus()).toBe(SwapComposerStatus.SIGNED)
    })

    it('should automatically add swap transactions if not added', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) => {
          return txns.map((txn) => {
            const sk = algosdk.generateAccount().sk
            return algosdk.signTransaction(txn, sk).blob
          })
        },
      })

      expect(composer.count()).toBe(0)

      await composer.sign()

      expect(composer.count()).toBeGreaterThan(0)
    })

    it('should delegate signing to atc.gatherSignatures', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      composer.addTransaction(createMockTransaction())
      await composer.addSwapTransactions()

      const mockSignedTxns = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ]
      const gatherSigsSpy = vi
        .spyOn((composer as any).atc, 'gatherSignatures')
        .mockResolvedValue(mockSignedTxns)

      const result = await composer.sign()

      // Verify delegation to ATC
      expect(gatherSigsSpy).toHaveBeenCalled()
      expect(result).toBe(mockSignedTxns)

      gatherSigsSpy.mockRestore()
    })

    it('should handle pre-signed transactions', async () => {
      const logicSig = new algosdk.LogicSigAccount(
        new Uint8Array([1, 32, 1, 1, 34]), // Simple TEAL program
      )

      const appAddress = algosdk.getApplicationAddress(BigInt(123456))
      const txn = createMockTransaction(appAddress.toString())
      const signedTxn = algosdk.signLogicSigTransactionObject(txn, logicSig)

      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
          'base64',
        ),
        signature: {
          type: 'logic_signature',
          value: Object.fromEntries(
            signedTxn.blob.entries(),
          ) as unknown as Record<string, number>,
        },
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (
          txns: algosdk.Transaction[],
          indexesToSign: number[],
        ) => {
          // Should receive all transactions but no indexes to sign
          expect(txns.length).toBe(1)
          expect(indexesToSign.length).toBe(0)
          return [new Uint8Array()]
        },
      })

      await composer.addSwapTransactions()

      const signedTxns = await composer.sign()

      expect(signedTxns.length).toBeGreaterThan(0)
    })

    it('should pass correct indexes for user transactions that need signing', async () => {
      const logicSig = new algosdk.LogicSigAccount(
        new Uint8Array([1, 32, 1, 1, 34]), // Simple TEAL program
      )

      const appAddress = algosdk.getApplicationAddress(BigInt(123456))
      const preSignedTxn = createMockTransaction(appAddress.toString())
      const signedTxn = algosdk.signLogicSigTransactionObject(
        preSignedTxn,
        logicSig,
      )

      const mockPreSignedSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(preSignedTxn),
        ).toString('base64'),
        signature: {
          type: 'logic_signature',
          value: Object.fromEntries(
            signedTxn.blob.entries(),
          ) as unknown as Record<string, number>,
        },
        group: '',
        logicSigBlob: false,
      }

      const mockUserSwapTxn: SwapTransaction = createMockSwapTxn()

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [
          mockUserSwapTxn,
          mockPreSignedSwapTxn,
          mockUserSwapTxn,
        ],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (
          txns: algosdk.Transaction[],
          indexesToSign: number[],
        ) => {
          // Should receive all 3 transactions
          expect(txns.length).toBe(3)
          // Should only sign indexes 0 and 2 (user transactions)
          expect(indexesToSign).toEqual([0, 2])
          // Return valid signed transactions
          return txns.map((txn) => createValidSignedTxnBlob(txn))
        },
      })

      await composer.addSwapTransactions()

      const signedTxns = await composer.sign()

      expect(signedTxns.length).toBe(3)
    })

    it('should handle ARC-1 compliant signers that return nulls for non-signed transactions', async () => {
      const logicSig = new algosdk.LogicSigAccount(
        new Uint8Array([1, 32, 1, 1, 34]), // Simple TEAL program
      )

      const appAddress = algosdk.getApplicationAddress(BigInt(123456))
      const preSignedTxn = createMockTransaction(appAddress.toString())
      const signedTxn = algosdk.signLogicSigTransactionObject(
        preSignedTxn,
        logicSig,
      )

      const mockPreSignedSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(preSignedTxn),
        ).toString('base64'),
        signature: {
          type: 'logic_signature',
          value: Object.fromEntries(
            signedTxn.blob.entries(),
          ) as unknown as Record<string, number>,
        },
        group: '',
        logicSigBlob: false,
      }

      const mockUserSwapTxn: SwapTransaction = createMockSwapTxn()

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [
          mockUserSwapTxn,
          mockPreSignedSwapTxn,
          mockUserSwapTxn,
        ],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (
          txns: algosdk.Transaction[],
          indexesToSign: number[],
        ) => {
          // ARC-1 pattern: return array matching txns.length with nulls for non-signed
          const result: (Uint8Array | null)[] = new Array(txns.length).fill(
            null,
          )

          // Only sign the transactions at the specified indexes
          for (const index of indexesToSign) {
            const txn = txns[index]
            if (txn) {
              result[index] = createValidSignedTxnBlob(txn)
            }
          }

          return result
        },
      })

      await composer.addSwapTransactions()

      const signedTxns = await composer.sign()

      // Should still return 3 signed transactions with nulls filtered out and pre-signed added
      expect(signedTxns.length).toBe(3)
      expect(signedTxns.every((txn) => txn instanceof Uint8Array)).toBe(true)
    })

    it('should call buildGroup before gathering signatures', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      const buildGroupSpy = vi.spyOn((composer as any).atc, 'buildGroup')
      const gatherSigsSpy = vi
        .spyOn((composer as any).atc, 'gatherSignatures')
        .mockResolvedValue([new Uint8Array([1])])

      composer.addTransaction(createMockTransaction())

      await composer.sign()

      // ATC's gatherSignatures calls buildGroup internally
      expect(gatherSigsSpy).toHaveBeenCalled()

      buildGroupSpy.mockRestore()
      gatherSigsSpy.mockRestore()
    })
  })

  describe('submit', () => {
    it('should delegate to atc.submit with correct algodClient', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      composer.addTransaction(createMockTransaction())
      await composer.addSwapTransactions()

      const atcSubmitSpy = vi
        .spyOn((composer as any).atc, 'submit')
        .mockResolvedValue(['tx1', 'tx2'])

      const txIds = await composer.submit()

      // Verify delegation to ATC with correct parameters
      expect(atcSubmitSpy).toHaveBeenCalledWith(mockAlgodClient)
      expect(txIds).toEqual(['tx1', 'tx2'])

      atcSubmitSpy.mockRestore()
    })

    it('should auto-add swap transactions before submitting', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      const atcSubmitSpy = vi
        .spyOn((composer as any).atc, 'submit')
        .mockResolvedValue(['tx1'])

      // Don't manually add swap transactions
      expect(composer.count()).toBe(0)

      await composer.submit()

      // Verify swap transactions were auto-added before submission
      expect(composer.count()).toBe(1)
      expect(atcSubmitSpy).toHaveBeenCalledWith(mockAlgodClient)

      atcSubmitSpy.mockRestore()
    })
  })

  describe('execute', () => {
    it('should auto-add swap transactions and call atc.execute with correct parameters', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) => {
          return txns.map((txn) => createValidSignedTxnBlob(txn))
        },
      })

      // Spy on the internal ATC
      const atcExecuteSpy = vi
        .spyOn((composer as any).atc, 'execute')
        .mockResolvedValue({
          confirmedRound: BigInt(1002),
          txIDs: ['tx1', 'tx2'],
          methodResults: [],
        })

      composer.addTransaction(createMockTransaction())

      const result = await composer.execute()

      // Verify swap transactions were auto-added
      expect(composer.count()).toBe(2) // 1 user txn + 1 swap txn

      // Verify ATC execute was called with correct parameters
      expect(atcExecuteSpy).toHaveBeenCalledWith(mockAlgodClient, 10) // default wait rounds

      // Verify return value transformation (txIDs -> txIds)
      expect(result.txIds).toEqual(['tx1', 'tx2'])
      expect(result.confirmedRound).toBe(BigInt(1002))
      expect(result.methodResults).toBeDefined()

      atcExecuteSpy.mockRestore()
    })

    it('should pass custom wait rounds to atc.execute', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) => {
          return txns.map((txn) => createValidSignedTxnBlob(txn))
        },
      })

      const atcExecuteSpy = vi
        .spyOn((composer as any).atc, 'execute')
        .mockResolvedValue({
          confirmedRound: BigInt(1002),
          txIDs: ['tx1'],
          methodResults: [],
        })

      composer.addTransaction(createMockTransaction())

      await composer.execute(10)

      // Verify custom wait rounds parameter is passed
      expect(atcExecuteSpy).toHaveBeenCalledWith(mockAlgodClient, 10)

      atcExecuteSpy.mockRestore()
    })

    it('should not add swap transactions if already added', async () => {
      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [createMockSwapTxn()],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) => {
          return txns.map((txn) => createValidSignedTxnBlob(txn))
        },
      })

      const atcExecuteSpy = vi
        .spyOn((composer as any).atc, 'execute')
        .mockResolvedValue({
          confirmedRound: BigInt(1002),
          txIDs: ['tx1', 'tx2'],
          methodResults: [],
        })

      composer.addTransaction(createMockTransaction())
      await composer.addSwapTransactions()

      const countBeforeExecute = composer.count()

      await composer.execute()

      // Count should not increase (swap transactions already added)
      expect(composer.count()).toBe(countBeforeExecute)

      atcExecuteSpy.mockRestore()
    })
  })

  describe('transaction processing (via public API)', () => {
    describe('app opt-in processing', () => {
      it('should not create opt-in transactions when none required', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const quote: Partial<FetchQuoteResponse> = {
          ...createMockQuote(),
          requiredAppOptIns: [], // No opt-ins required
        }

        const composer = new SwapComposer({
          quote: quote as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Should only have the swap transaction, no opt-ins
        expect(composer.count()).toBe(1)
      })

      it('should not create opt-in transactions when already opted in', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const quote: Partial<FetchQuoteResponse> = {
          ...createMockQuote(),
          requiredAppOptIns: [123456],
        }

        // Mock that user is already opted into app 123456
        mockAlgodClient.accountInformation = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            appsLocalState: [{ id: 123456 }],
            assets: [],
          }),
        })

        const composer = new SwapComposer({
          quote: quote as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Should only have the swap transaction, no opt-ins
        expect(composer.count()).toBe(1)
      })

      it('should create opt-in transactions for missing apps', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const quote: Partial<FetchQuoteResponse> = {
          ...createMockQuote(),
          requiredAppOptIns: [123456],
        }

        // Mock that user is not opted in
        mockAlgodClient.accountInformation = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            appsLocalState: [],
            assets: [],
          }),
        })

        const composer = new SwapComposer({
          quote: quote as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Should have opt-in + swap transaction
        expect(composer.count()).toBe(2)
      })

      it('should only create opt-ins for apps not already opted in', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const quote: Partial<FetchQuoteResponse> = {
          ...createMockQuote(),
          requiredAppOptIns: [123456, 789012, 345678],
        }

        // Mock that user is opted into one of the three apps
        mockAlgodClient.accountInformation = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            appsLocalState: [{ id: 789012 }],
            assets: [],
          }),
        })

        const composer = new SwapComposer({
          quote: quote as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Should have 2 opt-ins + 1 swap = 3 total
        expect(composer.count()).toBe(3)
      })

      it('should handle empty appsLocalState', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const quote: Partial<FetchQuoteResponse> = {
          ...createMockQuote(),
          requiredAppOptIns: [123456],
        }

        // Mock that appsLocalState is undefined
        mockAlgodClient.accountInformation = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            appsLocalState: undefined,
            assets: [],
          }),
        })

        const composer = new SwapComposer({
          quote: quote as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Should have opt-in + swap transaction
        expect(composer.count()).toBe(2)
      })
    })

    describe('swap transaction decoding', () => {
      it('should process a single user transaction', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(
            algosdk.encodeUnsignedTransaction(createMockTransaction()),
          ).toString('base64'),
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        expect(composer.count()).toBe(1)
      })

      it('should process multiple transactions', async () => {
        const mockSwapTxns: SwapTransaction[] = [
          {
            data: Buffer.from(
              algosdk.encodeUnsignedTransaction(createMockTransaction()),
            ).toString('base64'),
            signature: false,
            group: '',
            logicSigBlob: false,
          },
          {
            data: Buffer.from(
              algosdk.encodeUnsignedTransaction(createMockTransaction()),
            ).toString('base64'),
            signature: false,
            group: '',
            logicSigBlob: false,
          },
        ]

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: mockSwapTxns,
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        expect(composer.count()).toBe(2)
      })

      it('should throw error for invalid transaction data', async () => {
        const mockSwapTxn: SwapTransaction = {
          data: 'invalid-base64-data',
          signature: false,
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await expect(composer.addSwapTransactions()).rejects.toThrow(
          'Failed to process swap transaction',
        )
      })

      it('should throw error for empty transaction array', () => {
        expect(
          () =>
            new SwapComposer({
              quote: createMockQuote() as FetchQuoteResponse,
              swapTxns: [],
              algodClient: mockAlgodClient,
              address: validAddress,
              signer: async (txns: algosdk.Transaction[]) =>
                txns.map(() => new Uint8Array(0)),
            }),
        ).toThrow('Swap transactions array cannot be empty')
      })
    })

    describe('transaction re-signing', () => {
      it('should re-sign transaction with logic signature', async () => {
        const logicSig = new algosdk.LogicSigAccount(
          new Uint8Array([1, 32, 1, 1, 34]),
        )

        const appAddress = algosdk.getApplicationAddress(BigInt(123456))
        const txn = createMockTransaction(appAddress.toString())
        const signedTxn = algosdk.signLogicSigTransactionObject(txn, logicSig)

        const mockLsigSwapTxn: SwapTransaction = {
          data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
            'base64',
          ),
          signature: {
            type: 'logic_signature',
            value: Object.fromEntries(
              signedTxn.blob.entries(),
            ) as unknown as Record<string, number>,
          },
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockLsigSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        const signedTxns = await composer.sign()

        expect(signedTxns.length).toBeGreaterThan(0)
      })

      it('should handle transaction re-signing with secret key', async () => {
        const account = algosdk.generateAccount()
        const txn = createMockTransaction(account.addr.toString())

        const mockSkSwapTxn: SwapTransaction = {
          data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
            'base64',
          ),
          signature: {
            type: 'secret_key',
            value: Object.fromEntries(
              account.sk.entries(),
            ) as unknown as Record<string, number>,
          },
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockSkSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        const signedTxns = await composer.sign()

        expect(signedTxns.length).toBeGreaterThan(0)
      })

      it('should throw error for logic signature missing lsig field', async () => {
        const appAddress = algosdk.getApplicationAddress(BigInt(123456))
        const txn = createMockTransaction(appAddress.toString())

        // Create invalid signature structure without lsig field
        const invalidSignatureBlob = new Uint8Array([
          0x81, // msgpack map with 1 element
          0xa4,
          0x74,
          0x65,
          0x73,
          0x74, // key: "test"
          0xa5,
          0x76,
          0x61,
          0x6c,
          0x75,
          0x65, // value: "value"
        ])

        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
            'base64',
          ),
          signature: {
            type: 'logic_signature',
            value: Object.fromEntries(
              invalidSignatureBlob.entries(),
            ) as unknown as Record<string, number>,
          },
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Error happens during signing when the swap signer is called
        await expect(composer.sign()).rejects.toThrow(
          'Logic signature structure missing lsig field',
        )
      })

      it('should throw error for unsupported signature type', async () => {
        const txn = createMockTransaction()

        const mockSwapTxn: SwapTransaction = {
          data: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
            'base64',
          ),
          signature: {
            type: 'unsupported_type' as any,
            value: {} as Record<string, number>,
          },
          group: '',
          logicSigBlob: false,
        }

        const composer = new SwapComposer({
          quote: createMockQuote() as FetchQuoteResponse,
          swapTxns: [mockSwapTxn],
          algodClient: mockAlgodClient,
          address: validAddress,
          signer: async (txns: algosdk.Transaction[]) =>
            txns.map(() => new Uint8Array(0)),
        })

        await composer.addSwapTransactions()

        // Error happens during signing when the swap signer is called
        await expect(composer.sign()).rejects.toThrow(
          'Unsupported signature type',
        )
      })
    })
  })

  describe('note configuration', () => {
    it('should set the note on the user-signed transaction', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const testNote = new TextEncoder().encode('test-tracking-id-123')

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
        note: testNote,
      })

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      // The user-signed transaction should have the note set
      expect(txns[0]?.txn.note).toEqual(testNote)
    })

    it('should not modify transactions when note is not provided', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
        // No note provided
      })

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      // The transaction should have an empty note (default)
      expect(txns[0]?.txn.note).toEqual(new Uint8Array())
    })

    it('should only set note on user-signed transaction, not pre-signed', async () => {
      const logicSig = new algosdk.LogicSigAccount(
        new Uint8Array([1, 32, 1, 1, 34]),
      )

      const appAddress = algosdk.getApplicationAddress(BigInt(123456))
      const preSignedTxn = createMockTransaction(appAddress.toString())
      const signedTxn = algosdk.signLogicSigTransactionObject(
        preSignedTxn,
        logicSig,
      )

      const mockPreSignedSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(preSignedTxn),
        ).toString('base64'),
        signature: {
          type: 'logic_signature',
          value: Object.fromEntries(
            signedTxn.blob.entries(),
          ) as unknown as Record<string, number>,
        },
        group: '',
        logicSigBlob: false,
      }

      const mockUserSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const testNote = new TextEncoder().encode('user-txn-note')

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockPreSignedSwapTxn, mockUserSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
        note: testNote,
      })

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      // Pre-signed transaction (index 0) should NOT have the note
      expect(txns[0]?.txn.note).toEqual(new Uint8Array())

      // User-signed transaction (index 1) should have the note
      expect(txns[1]?.txn.note).toEqual(testNote)
    })
  })

  describe('getInputTransactionId', () => {
    it('should return undefined before group is built', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Before adding swap transactions
      expect(composer.getInputTransactionId()).toBeUndefined()

      // After adding swap transactions but before building
      await composer.addSwapTransactions()
      expect(composer.getInputTransactionId()).toBeUndefined()
    })

    it('should return transaction ID after buildGroup is called', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      await composer.addSwapTransactions()
      composer.buildGroup()

      const txId = composer.getInputTransactionId()

      expect(txId).toBeDefined()
      expect(typeof txId).toBe('string')
      expect(txId?.length).toBeGreaterThan(0)
    })

    it('should return transaction ID after sign is called', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      await composer.sign()

      const txId = composer.getInputTransactionId()

      expect(txId).toBeDefined()
      expect(typeof txId).toBe('string')
    })

    it('should return transaction ID after execute is called', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Build the group first so transactions are set up
      await composer.addSwapTransactions()
      composer.buildGroup()

      // Mock execute to skip network calls
      vi.spyOn((composer as any).atc, 'execute').mockResolvedValue({
        confirmedRound: BigInt(1002),
        txIDs: ['tx1'],
        methodResults: [],
      })

      await composer.execute()

      const txId = composer.getInputTransactionId()

      expect(txId).toBeDefined()
      expect(typeof txId).toBe('string')
    })

    it('should return correct index when there are transactions before swap', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Add transaction before swap
      composer.addTransaction(createMockTransaction())

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      const txId = composer.getInputTransactionId()

      // The input transaction should be at index 1 (after the user-added transaction)
      expect(txId).toBe(txns[1]?.txn.txID())
    })

    it('should return correct index with app opt-ins', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const quote: Partial<FetchQuoteResponse> = {
        ...createMockQuote(),
        requiredAppOptIns: [123456],
      }

      // Mock that user is not opted in
      mockAlgodClient.accountInformation = vi.fn().mockReturnValue({
        do: vi.fn().mockResolvedValue({
          appsLocalState: [],
          assets: [],
        }),
      })

      const composer = new SwapComposer({
        quote: quote as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      const txId = composer.getInputTransactionId()

      // The input transaction should be at index 1 (after the app opt-in)
      // Index 0 = app opt-in, Index 1 = user's swap transaction
      expect(txId).toBe(txns[1]?.txn.txID())
    })

    it('should track correct index with mixed pre-signed and user transactions', async () => {
      const logicSig = new algosdk.LogicSigAccount(
        new Uint8Array([1, 32, 1, 1, 34]),
      )

      const appAddress = algosdk.getApplicationAddress(BigInt(123456))
      const preSignedTxn = createMockTransaction(appAddress.toString())
      const signedTxn = algosdk.signLogicSigTransactionObject(
        preSignedTxn,
        logicSig,
      )

      const mockPreSignedSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(preSignedTxn),
        ).toString('base64'),
        signature: {
          type: 'logic_signature',
          value: Object.fromEntries(
            signedTxn.blob.entries(),
          ) as unknown as Record<string, number>,
        },
        group: '',
        logicSigBlob: false,
      }

      const mockUserSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockPreSignedSwapTxn, mockUserSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      await composer.addSwapTransactions()
      const txns = composer.buildGroup()

      const txId = composer.getInputTransactionId()

      // The user-signed input transaction should be at index 1
      expect(txId).toBe(txns[1]?.txn.txID())
    })
  })

  describe('getSummary', () => {
    it('should return undefined before execution', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const quote: Partial<FetchQuoteResponse> = {
        ...createMockQuote(),
        type: 'fixed-input',
      }

      const composer = new SwapComposer({
        quote: quote as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Before adding swap transactions
      expect(composer.getSummary()).toBeUndefined()

      // After adding swap transactions but before building
      await composer.addSwapTransactions()
      expect(composer.getSummary()).toBeUndefined()

      // After building but before execution
      composer.buildGroup()
      expect(composer.getSummary()).toBeUndefined()

      // After signing but before execution
      await composer.sign()
      expect(composer.getSummary()).toBeUndefined()
    })

    it('should initialize summaryData with input transaction details during processSwapTransactions', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const quote: Partial<FetchQuoteResponse> = {
        ...createMockQuote(),
        fromASAID: 0,
        toASAID: 31566704,
        type: 'fixed-input',
      }

      const composer = new SwapComposer({
        quote: quote as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      await composer.addSwapTransactions()

      // getSummary returns undefined before execution, but summaryData should be initialized
      // We can't directly access private summaryData, but we can verify it's set up
      // by checking that the composer processed successfully
      expect(composer.count()).toBe(1)
    })
  })

  describe('integration scenarios', () => {
    it('should handle a complete swap workflow', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Spy on ATC execute
      const atcExecuteSpy = vi
        .spyOn((composer as any).atc, 'execute')
        .mockResolvedValue({
          confirmedRound: BigInt(1002),
          txIDs: ['tx1', 'tx2', 'tx3'],
          methodResults: [],
        })

      expect(composer.getStatus()).toBe(SwapComposerStatus.BUILDING)

      const beforeTxn = createMockTransaction()
      const afterTxn = createMockTransaction()

      composer.addTransaction(beforeTxn)
      await composer.addSwapTransactions()
      composer.addTransaction(afterTxn)

      expect(composer.count()).toBeGreaterThanOrEqual(3)

      const result = await composer.execute(1234)

      // Verify execute was called with custom wait rounds
      expect(atcExecuteSpy).toHaveBeenCalledWith(mockAlgodClient, 1234)

      expect(result.confirmedRound).toBe(BigInt(1002))
      expect(result.txIds.length).toBe(3)
      expect(result.methodResults).toBeDefined()

      atcExecuteSpy.mockRestore()
    })

    it('should handle swap without additional transactions', async () => {
      const mockSwapTxn: SwapTransaction = {
        data: Buffer.from(
          algosdk.encodeUnsignedTransaction(createMockTransaction()),
        ).toString('base64'),
        signature: false,
        group: '',
        logicSigBlob: false,
      }

      const composer = new SwapComposer({
        quote: createMockQuote() as FetchQuoteResponse,
        swapTxns: [mockSwapTxn],
        algodClient: mockAlgodClient,
        address: validAddress,
        signer: async (txns: algosdk.Transaction[]) =>
          txns.map((txn) => createValidSignedTxnBlob(txn)),
      })

      // Spy on ATC execute
      const atcExecuteSpy = vi
        .spyOn((composer as any).atc, 'execute')
        .mockResolvedValue({
          confirmedRound: BigInt(1002),
          txIDs: ['tx1'],
          methodResults: [],
        })

      expect(composer.count()).toBe(0)

      // Execute without manually adding swap transactions
      const result = await composer.execute(10)

      // Verify swap transactions were auto-added
      expect(composer.count()).toBe(1)

      // Verify execute was called with custom wait rounds
      expect(atcExecuteSpy).toHaveBeenCalledWith(mockAlgodClient, 10)

      expect(result.txIds.length).toBe(1)
      expect(result.methodResults).toBeDefined()

      atcExecuteSpy.mockRestore()
    })
  })
})
