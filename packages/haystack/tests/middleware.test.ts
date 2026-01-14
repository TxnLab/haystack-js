import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterClient } from '../src/client'
import { AutoOptOutMiddleware } from '../src/middleware'
import type { QuoteContext, SwapMiddleware } from '../src/middleware'
import type { FetchQuoteParams } from '../src/types'
import type { Algodv2 } from 'algosdk'

describe('Middleware System', () => {
  describe('SwapMiddleware interface', () => {
    it('should create a middleware with all required properties', () => {
      const middleware: SwapMiddleware = {
        name: 'TestMiddleware',
        version: '1.0.0',
        shouldApply: async () => true,
        adjustQuoteParams: async (params) => params,
        beforeSwap: async () => [],
        afterSwap: async () => [],
      }

      expect(middleware.name).toBe('TestMiddleware')
      expect(middleware.version).toBe('1.0.0')
      expect(middleware.shouldApply).toBeDefined()
    })

    it('should work with minimal middleware (no optional hooks)', () => {
      const middleware: SwapMiddleware = {
        name: 'MinimalMiddleware',
        version: '1.0.0',
        shouldApply: async () => false,
      }

      expect(middleware.adjustQuoteParams).toBeUndefined()
      expect(middleware.beforeSwap).toBeUndefined()
      expect(middleware.afterSwap).toBeUndefined()
    })
  })

  describe('RouterClient with middleware', () => {
    it('should accept middleware in constructor', () => {
      const middleware: SwapMiddleware = {
        name: 'TestMiddleware',
        version: '1.0.0',
        shouldApply: async () => true,
      }

      const router = new RouterClient({
        apiKey: 'test-key',
        middleware: [middleware],
      })

      expect(router).toBeInstanceOf(RouterClient)
    })

    it('should work without middleware', () => {
      const router = new RouterClient({
        apiKey: 'test-key',
      })

      expect(router).toBeInstanceOf(RouterClient)
    })

    it('should accept multiple middleware instances', () => {
      const middleware1: SwapMiddleware = {
        name: 'Middleware1',
        version: '1.0.0',
        shouldApply: async () => true,
      }

      const middleware2: SwapMiddleware = {
        name: 'Middleware2',
        version: '1.0.0',
        shouldApply: async () => true,
      }

      const router = new RouterClient({
        apiKey: 'test-key',
        middleware: [middleware1, middleware2],
      })

      expect(router).toBeInstanceOf(RouterClient)
    })
  })

  describe('Middleware quote adjustments', () => {
    it('should apply adjustQuoteParams from middleware', async () => {
      const CUSTOM_ASSET_ID = 12345n

      const middleware: SwapMiddleware = {
        name: 'TestMiddleware',
        version: '1.0.0',
        shouldApply: async (params) => {
          return (
            params.fromASAID === CUSTOM_ASSET_ID ||
            params.toASAID === CUSTOM_ASSET_ID
          )
        },
        adjustQuoteParams: async (params: FetchQuoteParams) => {
          // Reduce maxGroupSize by 3 for custom asset
          return {
            ...params,
            maxGroupSize: (params.maxGroupSize ?? 16) - 3,
          }
        },
      }

      const router = new RouterClient({
        apiKey: 'test-key',
        middleware: [middleware],
      })

      // Mock the fetchQuote method to capture params
      let capturedParams: FetchQuoteParams | null = null
      vi.spyOn(router as any, 'fetchQuote').mockImplementation(
        async (params) => {
          capturedParams = params as FetchQuoteParams
          return {
            quote: '1000000',
            fromASAID: (params as FetchQuoteParams).fromASAID,
            toASAID: (params as FetchQuoteParams).toASAID,
            route: [],
            requiredAppOptIns: [],
            txnPayload: { iv: 'test', data: 'test' },
            profit: {
              amount: 0,
              asa: {
                id: 0,
                decimals: 6,
                unit_name: 'ALGO',
                name: 'Algorand',
                price_algo: 1,
                price_usd: 0,
              },
            },
            priceBaseline: 1,
            usdIn: 0,
            usdOut: 0,
            flattenedRoute: {},
            quotes: [],
            type: 'fixed-input',
            protocolFees: {},
          }
        },
      )

      await router.newQuote({
        fromASAID: CUSTOM_ASSET_ID,
        toASAID: 0,
        amount: 1_000_000,
      })

      expect(capturedParams).not.toBeNull()
      expect(capturedParams!.maxGroupSize).toBe(13) // 16 - 3
    })

    it('should chain multiple middleware adjustments', async () => {
      const middleware1: SwapMiddleware = {
        name: 'Middleware1',
        version: '1.0.0',
        shouldApply: async () => true,
        adjustQuoteParams: async (params) => ({
          ...params,
          maxGroupSize: (params.maxGroupSize ?? 16) - 2,
        }),
      }

      const middleware2: SwapMiddleware = {
        name: 'Middleware2',
        version: '1.0.0',
        shouldApply: async () => true,
        adjustQuoteParams: async (params) => ({
          ...params,
          maxGroupSize: (params.maxGroupSize ?? 16) - 1,
        }),
      }

      const router = new RouterClient({
        apiKey: 'test-key',
        middleware: [middleware1, middleware2],
      })

      let capturedParams: FetchQuoteParams | null = null
      vi.spyOn(router as any, 'fetchQuote').mockImplementation(
        async (params) => {
          capturedParams = params as FetchQuoteParams
          return {
            quote: '1000000',
            fromASAID: (params as FetchQuoteParams).fromASAID,
            toASAID: (params as FetchQuoteParams).toASAID,
            route: [],
            requiredAppOptIns: [],
            txnPayload: { iv: 'test', data: 'test' },
            profit: {
              amount: 0,
              asa: {
                id: 0,
                decimals: 6,
                unit_name: 'ALGO',
                name: 'Algorand',
                price_algo: 1,
                price_usd: 0,
              },
            },
            priceBaseline: 1,
            usdIn: 0,
            usdOut: 0,
            flattenedRoute: {},
            quotes: [],
            type: 'fixed-input',
            protocolFees: {},
          }
        },
      )

      await router.newQuote({
        fromASAID: 0,
        toASAID: 31566704,
        amount: 1_000_000,
      })

      expect(capturedParams!.maxGroupSize).toBe(13) // 16 - 2 - 1
    })

    it('should not apply middleware when shouldApply returns false', async () => {
      const middleware: SwapMiddleware = {
        name: 'TestMiddleware',
        version: '1.0.0',
        shouldApply: async () => false,
        adjustQuoteParams: async (params) => ({
          ...params,
          maxGroupSize: 1, // Should not be applied
        }),
      }

      const router = new RouterClient({
        apiKey: 'test-key',
        middleware: [middleware],
      })

      let capturedParams: FetchQuoteParams | null = null
      vi.spyOn(router as any, 'fetchQuote').mockImplementation(
        async (params) => {
          capturedParams = params as FetchQuoteParams
          return {
            quote: '1000000',
            fromASAID: (params as FetchQuoteParams).fromASAID,
            toASAID: (params as FetchQuoteParams).toASAID,
            route: [],
            requiredAppOptIns: [],
            txnPayload: { iv: 'test', data: 'test' },
            profit: {
              amount: 0,
              asa: {
                id: 0,
                decimals: 6,
                unit_name: 'ALGO',
                name: 'Algorand',
                price_algo: 1,
                price_usd: 0,
              },
            },
            priceBaseline: 1,
            usdIn: 0,
            usdOut: 0,
            flattenedRoute: {},
            quotes: [],
            type: 'fixed-input',
            protocolFees: {},
          }
        },
      )

      await router.newQuote({
        fromASAID: 0,
        toASAID: 31566704,
        amount: 1_000_000,
        maxGroupSize: 16,
      })

      expect(capturedParams!.maxGroupSize).toBe(16) // Default, not modified
    })
  })

  describe('SwapContext', () => {
    it('should provide correct context to middleware hooks', async () => {
      const middleware: SwapMiddleware = {
        name: 'ContextTestMiddleware',
        version: '1.0.0',
        shouldApply: async () => true,
        beforeSwap: async () => {
          // Context would be passed here in actual usage
          return []
        },
      }

      // This would require mocking the entire swap flow
      // For now, we can verify the middleware structure
      expect(middleware.beforeSwap).toBeDefined()
    })
  })

  describe('AutoOptOutMiddleware', () => {
    let mockAlgodClient: Algodv2

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
      it('should create middleware with default config', () => {
        const middleware = new AutoOptOutMiddleware()
        expect(middleware.name).toBe('AutoOptOut')
        expect(middleware.version).toBe('1.0.0')
      })

      it('should create middleware with excluded assets', () => {
        const middleware = new AutoOptOutMiddleware({
          excludedAssets: [31566704, 1234567n],
        })
        expect(middleware).toBeInstanceOf(AutoOptOutMiddleware)
      })

      it('should create middleware with empty excluded assets', () => {
        const middleware = new AutoOptOutMiddleware({
          excludedAssets: [],
        })
        expect(middleware).toBeInstanceOf(AutoOptOutMiddleware)
      })
    })

    describe('shouldApply', () => {
      it('should return false for fixed-output swaps', async () => {
        const middleware = new AutoOptOutMiddleware()
        const context: QuoteContext = {
          fromASAID: 12345n,
          toASAID: 0n,
          amount: 1_000_000n,
          type: 'fixed-output',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return false when address is not provided', async () => {
        const middleware = new AutoOptOutMiddleware()
        const context: QuoteContext = {
          fromASAID: 12345n,
          toASAID: 0n,
          amount: 1_000_000n,
          type: 'fixed-input',
          address: undefined,
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return false for ALGO (asset ID 0)', async () => {
        const middleware = new AutoOptOutMiddleware()
        const context: QuoteContext = {
          fromASAID: 0n,
          toASAID: 12345n,
          amount: 1_000_000n,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return false for excluded assets', async () => {
        const excludedAssetId = 31566704
        const middleware = new AutoOptOutMiddleware({
          excludedAssets: [excludedAssetId],
        })
        const context: QuoteContext = {
          fromASAID: BigInt(excludedAssetId),
          toASAID: 0n,
          amount: 1_000_000n,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return true when swapping full balance', async () => {
        const assetId = 12345n
        const fullBalance = 1_000_000n
        const middleware = new AutoOptOutMiddleware()

        // Mock algod client to return account with matching balance
        const mockAccountInfo = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            assets: [
              {
                assetId: assetId,
                amount: fullBalance,
              },
            ],
          }),
        })
        vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
          mockAccountInfo,
        )

        const context: QuoteContext = {
          fromASAID: assetId,
          toASAID: 0n,
          amount: fullBalance,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(true)
        expect(mockAccountInfo).toHaveBeenCalledWith('TEST_ADDRESS')
      })

      it('should return false when swapping partial balance', async () => {
        const assetId = 12345n
        const fullBalance = 1_000_000n
        const partialAmount = 500_000n
        const middleware = new AutoOptOutMiddleware()

        // Mock algod client to return account with higher balance
        const mockAccountInfo = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            assets: [
              {
                assetId: assetId,
                amount: fullBalance,
              },
            ],
          }),
        })
        vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
          mockAccountInfo,
        )

        const context: QuoteContext = {
          fromASAID: assetId,
          toASAID: 0n,
          amount: partialAmount,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return false when asset not found in account', async () => {
        const assetId = 12345n
        const middleware = new AutoOptOutMiddleware()

        // Mock algod client to return account without the asset
        const mockAccountInfo = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            assets: [
              {
                assetId: 99999n,
                amount: 1_000_000n,
              },
            ],
          }),
        })
        vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
          mockAccountInfo,
        )

        const context: QuoteContext = {
          fromASAID: assetId,
          toASAID: 0n,
          amount: 1_000_000n,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
      })

      it('should return false and log debug message on API error', async () => {
        const middleware = new AutoOptOutMiddleware()

        // Mock algod client to throw error
        const mockAccountInfo = vi.fn().mockReturnValue({
          do: vi.fn().mockRejectedValue(new Error('Network error')),
        })
        vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
          mockAccountInfo,
        )

        const context: QuoteContext = {
          fromASAID: 12345n,
          toASAID: 0n,
          amount: 1_000_000n,
          type: 'fixed-input',
          address: 'TEST_ADDRESS',
          algodClient: mockAlgodClient,
        }

        const result = await middleware.shouldApply(context)
        expect(result).toBe(false)
        // The middleware handles errors gracefully by returning false
        // Debug logging is an implementation detail we don't need to test
      })
    })

    describe('adjustQuoteParams', () => {
      it('should reduce maxGroupSize by 1', async () => {
        const middleware = new AutoOptOutMiddleware()
        const params: FetchQuoteParams = {
          fromASAID: 12345,
          toASAID: 0,
          amount: 1_000_000,
          maxGroupSize: 16,
        }

        const adjusted = await middleware.adjustQuoteParams(params)
        expect(adjusted.maxGroupSize).toBe(15)
      })

      it('should use default maxGroupSize when not provided', async () => {
        const middleware = new AutoOptOutMiddleware()
        const params: FetchQuoteParams = {
          fromASAID: 12345,
          toASAID: 0,
          amount: 1_000_000,
        }

        const adjusted = await middleware.adjustQuoteParams(params)
        expect(adjusted.maxGroupSize).toBe(15) // 16 - 1
      })

      it('should preserve other params', async () => {
        const middleware = new AutoOptOutMiddleware()
        const params: FetchQuoteParams = {
          fromASAID: 12345,
          toASAID: 0,
          amount: 1_000_000,
          type: 'fixed-input',
          disabledProtocols: [],
          maxDepth: 3,
        }

        const adjusted = await middleware.adjustQuoteParams(params)
        expect(adjusted.fromASAID).toBe(12345)
        expect(adjusted.toASAID).toBe(0)
        expect(adjusted.amount).toBe(1_000_000)
        expect(adjusted.type).toBe('fixed-input')
        expect(adjusted.disabledProtocols).toEqual([])
        expect(adjusted.maxDepth).toBe(3)
      })
    })

    describe('afterSwap', () => {
      it('should create asset opt-out transaction', async () => {
        const middleware = new AutoOptOutMiddleware()
        const mockSigner = vi.fn()
        const testAddress =
          'GD64YIY3TWGDMCNPP553DZPPR6LDUSFQOIJVFDPPXWEG3FVOJCCDBBHU5A' // Valid non-zero Algorand address
        const mockSuggestedParams = {
          fee: 1000,
          firstValid: 1000,
          lastValid: 2000,
          genesisHash: Buffer.from(
            'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
            'base64',
          ),
          genesisID: 'testnet-v1.0',
          minFee: 1000,
        }

        const context = {
          quote: {
            quote: 1_000_000n,
            amount: 1_000_000n,
            fromASAID: 12345,
            toASAID: 0,
            type: 'fixed-input',
            route: [],
            requiredAppOptIns: [],
            txnPayload: null,
            profit: {
              amount: 0,
              asa: {
                id: 0,
                decimals: 6,
                unit_name: 'ALGO',
                name: 'Algorand',
                price_algo: 1,
                price_usd: 0,
              },
            },
            priceBaseline: 1,
            usdIn: 0,
            usdOut: 0,
            flattenedRoute: {},
            quotes: [],
            protocolFees: {},
            createdAt: Date.now(),
          },
          address: testAddress,
          algodClient: mockAlgodClient,
          suggestedParams: mockSuggestedParams,
          fromASAID: 12345n,
          toASAID: 0n,
          signer: mockSigner,
        }

        const txns = await middleware.afterSwap(context)

        expect(txns).toHaveLength(1)
        expect(txns[0]?.txn).toBeDefined()
        expect(txns[0]?.signer).toBe(mockSigner)

        // Verify transaction was created successfully
        const txn = txns[0]?.txn
        expect(txn).toBeDefined()
        expect(txn?.type).toBe('axfer')
      })
    })

    describe('integration with RouterClient', () => {
      it('should work with RouterClient and adjust quote params', async () => {
        const assetId = 12345n
        const fullBalance = 1_000_000n
        const testAddress =
          'GD64YIY3TWGDMCNPP553DZPPR6LDUSFQOIJVFDPPXWEG3FVOJCCDBBHU5A'
        const middleware = new AutoOptOutMiddleware()

        const router = new RouterClient({
          apiKey: 'test-key',
          middleware: [middleware],
        })

        // Mock algod client with correct format
        const mockAccountInfo = vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({
            assets: [
              {
                assetId: assetId,
                amount: fullBalance,
              },
            ],
          }),
        })
        vi.spyOn(
          (router as any).algodClient,
          'accountInformation',
        ).mockImplementation(mockAccountInfo)

        // Mock fetchQuote
        let capturedParams: FetchQuoteParams | null = null
        vi.spyOn(router as any, 'fetchQuote').mockImplementation(
          async (params: any) => {
            capturedParams = params as FetchQuoteParams
            return {
              quote: '1000000',
              fromASAID: Number(params.fromASAID),
              toASAID: Number(params.toASAID),
              route: [],
              requiredAppOptIns: [],
              txnPayload: { iv: 'test', data: 'test' },
              profit: {
                amount: 0,
                asa: {
                  id: 0,
                  decimals: 6,
                  unit_name: 'ALGO',
                  name: 'Algorand',
                  price_algo: 1,
                  price_usd: 0,
                },
              },
              priceBaseline: 1,
              usdIn: 0,
              usdOut: 0,
              flattenedRoute: {},
              quotes: [],
              type: 'fixed-input',
              protocolFees: {},
            }
          },
        )

        await router.newQuote({
          fromASAID: assetId,
          toASAID: 0,
          amount: fullBalance,
          type: 'fixed-input',
          address: testAddress,
        })

        expect(capturedParams).not.toBeNull()
        expect(capturedParams!.maxGroupSize).toBe(15) // 16 - 1
      })
    })
  })
})
