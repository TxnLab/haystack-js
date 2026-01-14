# Haystack Router SDK - React Example

A simple React application demonstrating basic Haystack Router SDK integration with Vite and `@txnlab/use-wallet-react` for wallet management.

## Features

- Multiple wallet support (Pera, Defly, Lute)
- Modern wallet UI with `@txnlab/use-wallet-react` v4
- Get swap quotes from Haystack Router API
- Execute swaps with slippage protection
- Display quote details and routing information

## Prerequisites

- **Haystack Router API Key** - Request an API key by emailing [support@txnlab.dev](mailto:support@txnlab.dev)
- Node.js >= 20
- pnpm 10.20.0 or later

## Setup

1. Install dependencies from the repository root:

```bash
pnpm install
```

2. Create a `.env` file in this directory:

```bash
cp .env.example .env
```

3. Add your Haystack Router API key to the `.env` file:

```
VITE_HAYSTACK_ROUTER_API_KEY=your-api-key-here
```

## Development

Run the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

## Build

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Usage

1. Choose a wallet from the available options (Pera, Defly, or Lute)
2. Click to connect your chosen wallet
3. If you have multiple accounts, select the active account from the dropdown
4. Select the assets you want to swap
5. Enter the amount and slippage tolerance
6. Click "Get Quote" to fetch a quote from Haystack Router
7. Review the quote details (output amount, price impact, routing)
8. Click "Execute Swap" to perform the swap

## Wallet Configuration

The example is configured with multiple wallet providers in [src/main.tsx](./src/main.tsx):

```typescript
const walletManager = new WalletManager({
	wallets: [WalletId.DEFLY, WalletId.PERA, WalletId.LUTE],
	defaultNetwork: 'mainnet',
	options: {
		resetNetwork: true,
	},
});
```

You can customize which wallets are available by modifying this configuration.

## Notes

- This example uses mainnet (real assets!)
- Make sure you have sufficient ALGO/assets in your account
- The SDK automatically handles app and asset opt-ins when needed
- Slippage is set to 1% by default but can be adjusted
