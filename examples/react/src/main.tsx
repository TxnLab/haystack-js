import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { defly } from '@txnlab/use-wallet-defly'
import { pera } from '@txnlab/use-wallet-pera'
import { lute } from '@galaxypay/use-wallet-lute'
import App from './App'
import './index.css'

const walletManager = new WalletManager({
  wallets: [defly(), pera(), lute()],
  defaultNetwork: 'mainnet',
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

createRoot(rootElement).render(
  <StrictMode>
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  </StrictMode>,
)
