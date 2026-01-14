# Haystack Router SDK - React + TanStack Query Example

A React application demonstrating advanced Haystack Router SDK integration with TanStack Query (React Query) for automatic quote fetching and optimistic updates.

## Features

- **Automatic quote fetching** - Quotes are fetched automatically when a valid amount is entered
- **Fresh quotes** - Quotes automatically refetch every 15 seconds
- **React Query integration** - Uses `useQuery` for quotes and `useMutation` for swaps
- **Multiple wallet support** (Pera, Defly, Lute)
- **Modern wallet UI** with `@txnlab/use-wallet-react` v4
- **Real-time updates** - No "Get Quote" button needed
- **Execute swaps** with slippage protection
- **Display quote details** and routing information

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
6. **Quotes are fetched automatically** - no button needed!
7. Quotes refresh every 15 seconds to ensure you have the latest pricing
8. Review the quote details (output amount, price impact, routing)
9. Click "Execute Swap" to perform the swap

## React Query Integration

This example showcases how to use TanStack Query (React Query) with the Haystack Router SDK:

### Automatic Quote Fetching

```typescript
const { data: quote, error, isLoading } = useQuery({
  queryKey: ['quote', fromAsset, toAsset, amount],
  queryFn: async () => {
    const router = new RouterClient({ apiKey, autoOptIn: true })
    return await router.newQuote({
      fromASAID: fromAsset,
      toASAID: toAsset,
      amount: amountInBaseUnits,
      address: activeAddress,
    })
  },
  enabled: isValidQuoteRequest(),
  refetchInterval: 15000, // Refetch every 15 seconds
})
```

### Swap Execution with Mutations

```typescript
const swapMutation = useMutation({
  mutationFn: async () => {
    const router = new RouterClient({ apiKey, autoOptIn: true })
    const swap = await router.newSwap({
      quote,
      address: activeAddress,
      signer: transactionSigner,
      slippage: parseFloat(slippage),
    })
    return await swap.execute()
  },
  onSuccess: (result) => {
    // Handle success
  },
})
```

## Key Differences from Basic React Example

1. **No manual "Get Quote" button** - Quotes fetch automatically
2. **Auto-refresh** - Fresh quotes every 15 seconds
3. **React Query hooks** - `useQuery` and `useMutation` replace manual state management
4. **Simplified state** - No `loading` or `executing` state variables needed
5. **Better UX** - Users see quotes immediately as they type

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
- Quotes automatically refresh to ensure accurate pricing
