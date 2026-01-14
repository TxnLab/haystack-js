import { useState, useEffect } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { RouterClient, type SwapQuote } from '@txnlab/haystack-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { WalletMenu } from './components/WalletMenu'

const ALGO_ASSET_ID = 0
const USDC_ASSET_ID = 31566704
const USDT_ASSET_ID = 312769

function App() {
  const { activeAddress, transactionSigner } = useWallet()
  const [fromAsset, setFromAsset] = useState(ALGO_ASSET_ID)
  const [toAsset, setToAsset] = useState(USDC_ASSET_ID)
  const [amount, setAmount] = useState('1')
  const [debouncedAmount, setDebouncedAmount] = useState('1')
  const [slippage, setSlippage] = useState('1')
  const [success, setSuccess] = useState<string | null>(null)

  const apiKey = import.meta.env.VITE_HAYSTACK_ROUTER_API_KEY

  // Debounce amount input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(amount)
    }, 500)

    return () => clearTimeout(timer)
  }, [amount])

  // Validate if we should fetch a quote
  const isValidQuoteRequest = () => {
    if (!apiKey) return false
    const parsedAmount = parseFloat(debouncedAmount)
    return !isNaN(parsedAmount) && parsedAmount > 0
  }

  // Fetch quote automatically with React Query
  const {
    data: quote,
    error: quoteError,
    isLoading: isLoadingQuote,
  } = useQuery({
    queryKey: ['quote', fromAsset, toAsset, debouncedAmount],
    queryFn: async (): Promise<SwapQuote> => {
      if (!apiKey) {
        throw new Error(
          'Please set VITE_HAYSTACK_ROUTER_API_KEY in your .env file',
        )
      }

      const router = new RouterClient({
        apiKey,
        autoOptIn: true,
      })

      const amountInBaseUnits = BigInt(
        Math.floor(parseFloat(debouncedAmount) * 1_000_000),
      )

      const quoteResult = await router.newQuote({
        fromASAID: fromAsset,
        toASAID: toAsset,
        amount: amountInBaseUnits,
        address: activeAddress,
      })
      console.log('Quote received', quoteResult)

      return quoteResult
    },
    enabled: isValidQuoteRequest(),
    refetchInterval: 15000, // Refetch every 15 seconds
    retry: 1,
  })

  // Execute swap mutation
  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!quote || !activeAddress || !transactionSigner) {
        throw new Error('Missing required data for swap')
      }

      const router = new RouterClient({
        apiKey: apiKey || '',
        autoOptIn: true,
      })

      const swap = await router.newSwap({
        quote,
        address: activeAddress,
        signer: transactionSigner,
        slippage: parseFloat(slippage),
      })

      return await swap.execute()
    },
    onSuccess: (result) => {
      setSuccess(
        `Swap successful! Confirmed in round ${result.confirmedRound}. Transaction IDs: ${result.txIds.join(', ')}`,
      )
      setAmount('1')
    },
  })

  const formatAssetAmount = (amount: bigint, decimals = 6): string => {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals)
  }

  // Detect if we're waiting for a debounced quote
  const isFetchingQuote = isLoadingQuote || amount !== debouncedAmount
  const hasValidQuote = quote && amount === debouncedAmount

  const error = quoteError || swapMutation.error

  return (
    <div className="app">
      <h1>Haystack Router SDK Demo</h1>
      <p>React + TanStack Query + Vite Example</p>

      <div className="wallet-section">
        <WalletMenu />
      </div>

      <div className="swap-section enabled">
        <div className="input-group">
          <label>From Asset</label>
          <select
            className="asset-select"
            value={fromAsset}
            onChange={(e) => setFromAsset(Number(e.target.value))}
          >
            <option value={ALGO_ASSET_ID}>ALGO (0)</option>
            <option value={USDC_ASSET_ID}>USDC ({USDC_ASSET_ID})</option>
            <option value={USDT_ASSET_ID}>USDT ({USDT_ASSET_ID})</option>
          </select>
        </div>

        <div className="input-group">
          <label>To Asset</label>
          <select
            className="asset-select"
            value={toAsset}
            onChange={(e) => setToAsset(Number(e.target.value))}
          >
            <option value={ALGO_ASSET_ID}>ALGO (0)</option>
            <option value={USDC_ASSET_ID}>USDC ({USDC_ASSET_ID})</option>
            <option value={USDT_ASSET_ID}>USDT ({USDT_ASSET_ID})</option>
          </select>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>Amount</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
            />
          </div>

          <div className="input-group">
            <label>Slippage (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              placeholder="1.0"
            />
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            {error instanceof Error ? error.message : 'An error occurred'}
          </div>
        )}
        {success && <div className="alert alert-success">{success}</div>}

        {isFetchingQuote && (
          <div className="alert alert-info">
            <span className="loading" />
            Fetching quote...
          </div>
        )}

        {hasValidQuote && (
          <div className="quote-info">
            <h3>Quote Details</h3>
            <p>
              <strong>You'll receive:</strong> {formatAssetAmount(quote.quote)}{' '}
              tokens
            </p>
            <p>
              <strong>Price Impact:</strong>{' '}
              {quote.userPriceImpact?.toFixed(4) ?? 'N/A'}%
            </p>
            <p>
              <strong>USD In:</strong> ${quote.usdIn.toFixed(2)}
            </p>
            <p>
              <strong>USD Out:</strong> ${quote.usdOut.toFixed(2)}
            </p>
            <p>
              <strong>Route:</strong> {quote.route.length} path(s)
            </p>
          </div>
        )}

        <div className="button-group">
          <button
            className="button-primary"
            onClick={() => {
              setSuccess(null)
              swapMutation.mutate()
            }}
            disabled={
              !quote ||
              amount !== debouncedAmount ||
              swapMutation.isPending ||
              !activeAddress
            }
          >
            {swapMutation.isPending && <span className="loading" />}
            {swapMutation.isPending ? 'Executing...' : 'Execute Swap'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
