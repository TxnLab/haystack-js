import { useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { RouterClient, type SwapQuote } from '@txnlab/haystack-router'
import { WalletMenu } from './components/WalletMenu'

const ALGO_ASSET_ID = 0
const USDC_ASSET_ID = 31566704
const USDT_ASSET_ID = 312769

function App() {
  const { activeAddress, transactionSigner } = useWallet()
  const [fromAsset, setFromAsset] = useState(ALGO_ASSET_ID)
  const [toAsset, setToAsset] = useState(USDC_ASSET_ID)
  const [amount, setAmount] = useState('1')
  const [slippage, setSlippage] = useState('1')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const apiKey = import.meta.env.VITE_HAYSTACK_ROUTER_API_KEY

  const getQuote = async () => {
    if (!apiKey) {
      setError('Please set VITE_HAYSTACK_ROUTER_API_KEY in your .env file')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setQuote(null)

    try {
      const router = new RouterClient({
        apiKey,
        autoOptIn: true,
      })

      const amountInBaseUnits = BigInt(
        Math.floor(parseFloat(amount) * 1_000_000),
      )

      const quoteResult = await router.newQuote({
        fromASAID: fromAsset,
        toASAID: toAsset,
        amount: amountInBaseUnits,
        address: activeAddress,
      })
      console.log('Quote received', quoteResult)

      setQuote(quoteResult)
    } catch (err) {
      console.error('Error fetching quote', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch quote')
    } finally {
      setLoading(false)
    }
  }

  const executeSwap = async () => {
    if (!quote || !activeAddress || !transactionSigner) return

    setExecuting(true)
    setError(null)
    setSuccess(null)

    try {
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

      const result = await swap.execute()

      setSuccess(
        `Swap successful! Confirmed in round ${result.confirmedRound}. Transaction IDs: ${result.txIds.join(', ')}`,
      )
      setQuote(null)
      setAmount('1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute swap')
    } finally {
      setExecuting(false)
    }
  }

  const formatAssetAmount = (amount: bigint, decimals = 6): string => {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals)
  }

  return (
    <div className="app">
      <h1>Haystack Router SDK Demo</h1>
      <p>React + Vite Example</p>

      <div className="wallet-section">
        <WalletMenu />
      </div>

      <div className={`swap-section ${activeAddress ? 'enabled' : ''}`}>
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

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {quote && (
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
            className="button-secondary"
            onClick={getQuote}
            disabled={loading || !activeAddress}
          >
            {loading && <span className="loading" />}
            {loading ? 'Getting Quote...' : 'Get Quote'}
          </button>

          <button
            className="button-primary"
            onClick={executeSwap}
            disabled={!quote || executing || !activeAddress}
          >
            {executing && <span className="loading" />}
            {executing ? 'Executing...' : 'Execute Swap'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
