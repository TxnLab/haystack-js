# Haystack Router SDK

[![npm version](https://img.shields.io/npm/v/@txnlab/haystack-router.svg)](https://www.npmjs.com/package/@txnlab/haystack-router)
[![bundle size](https://deno.bundlejs.com/badge?q=@txnlab/haystack-router@latest&treeshake=[*])](https://bundlejs.com/?q=%40txnlab%2Fhaystack-router%40latest&treeshake=%5B*%5D)
[![CI](https://github.com/TxnLab/haystack-js/actions/workflows/ci.yml/badge.svg)](https://github.com/TxnLab/haystack-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

TypeScript/JavaScript SDK for [Haystack Order Router](https://txnlab.gitbook.io/haystack-router) - smart order routing and DEX aggregation on Algorand.

## Prerequisites

- **Haystack Router API Key** - Request an API key by emailing [support@txnlab.dev](mailto:support@txnlab.dev)
- algosdk 3.0.0 or later

## Installation

```bash
npm install @txnlab/haystack-router algosdk
```

> **Note**: `algosdk` is a peer dependency and must be installed alongside `@txnlab/haystack-router`.

## Quick Start

```typescript
import { RouterClient } from '@txnlab/haystack-router'
import { useWallet } from '@txnlab/use-wallet-*' // react, vue, solid, or svelte

const { activeAddress, transactionSigner } = useWallet()

// Initialize the client
const router = new RouterClient({
  apiKey: 'your-api-key',
})

// Get a quote
const quote = await router.newQuote({
  address: activeAddress,
  fromAssetId: 0, // ALGO
  toAssetId: 31566704, // USDC
  amount: 1_000_000, // 1 ALGO (in microAlgos)
})

// Execute the swap
const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner,
  slippage: 1, // 1% slippage tolerance
})
const result = await swap.execute()

console.log(`Swap completed in round ${result.confirmedRound}`)
```

## Usage

### Initialize the Client

```typescript
import { RouterClient } from '@txnlab/haystack-router'

// Basic initialization
const router = new RouterClient({
  apiKey: 'your-api-key',
})

// Custom Algod configuration
const router = new RouterClient({
  apiKey: 'your-api-key',
  algodUri: 'https://mainnet-api.4160.nodely.dev/',
  algodToken: '',
  algodPort: 443,
  autoOptIn: true, // Automatically handle asset opt-ins
})

// Earn fees with the referral program
const router = new RouterClient({
  apiKey: 'your-api-key',
  referrerAddress: 'YOUR_ALGORAND_ADDRESS', // Earns 25% of swap fees
  feeBps: 15, // 0.15% fee (max: 300 = 3%)
})
```

By providing your Algorand address as the `referrerAddress` when initializing the client, you can earn 25% of the swap fees generated through your integration. Set the `feeBps` parameter to specify the total fee charged to users (default: 0.15%, max: 3.00%). Learn more about the [Haystack Router Referral Program](https://txnlab.gitbook.io/haystack-router/referral-treasury/referral-program).

### Get a Swap Quote

The [`newQuote()`](#routerclientnewquote) method returns a [`SwapQuote`](#swapquote) object:

```typescript
// Basic quote
const quote = await router.newQuote({
  fromASAID: 0, // ALGO
  toASAID: 31566704, // USDC
  amount: 1_000_000, // 1 ALGO
  address: userAddress, // Required for auto opt-in detection
})
```

### Execute a Swap

The [`newSwap()`](#routerclientnewswap) method returns a [`SwapComposer`](#swapcomposer) instance:

```typescript
import { useWallet } from '@txnlab/use-wallet-*' // react, vue, solid, or svelte

const { activeAddress, transactionSigner } = useWallet()

const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner,
  slippage: 1, // 1% slippage tolerance
})
const result = await swap.execute()

console.log(`Confirmed in round ${result.confirmedRound}`)
console.log('Transaction IDs:', result.txIds)
```

### Transaction Tracking

Add a custom note to the input transaction for tracking purposes, and retrieve its transaction ID after execution:

```typescript
const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner,
  slippage: 1,
  note: new TextEncoder().encode('tracking-id-123'), // Custom note for tracking
})

const result = await swap.execute()

// Get the transaction ID of the user-signed input transaction
const inputTxId = swap.getInputTransactionId()
console.log('Input transaction ID:', inputTxId)
```

The `note` is applied only to the user-signed payment or asset transfer transaction (not pre-signed or middleware transactions). The transaction ID is available after calling `buildGroup()`, `sign()`, or `execute()`.

### Transaction Signing

The SDK supports both standard `algosdk.TransactionSigner` and ARC-1 compliant signer functions.

#### 1. use-wallet Signer (Recommended)

Use the `@txnlab/use-wallet` library for wallet management in your dApp:

```typescript
import { useWallet } from '@txnlab/use-wallet-*' // react, vue, solid, or svelte

const { activeAddress, transactionSigner } = useWallet()

const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner,
  slippage: 1,
})
await swap.execute()
```

> **Tip**: The [`@txnlab/use-wallet`](https://github.com/TxnLab/use-wallet) library supports multiple wallet providers (Pera, Defly, Lute, WalletConnect, etc.) and provides a unified interface. Choose the framework-specific adapter for your project: `@txnlab/use-wallet-react`, `@txnlab/use-wallet-vue`, `@txnlab/use-wallet-solid`, or `@txnlab/use-wallet-svelte`.

#### 2. Custom Signer Function

The SDK accepts custom signer functions that receive the complete transaction group and an array of indexes indicating which transactions need signing:

```typescript
import { Address, encodeUnsignedTransaction, type Transaction } from 'algosdk'

// Example: Wrapping an ARC-1 compliant wallet
const customSigner = async (
  txnGroup: Transaction[],
  indexesToSign: number[],
) => {
  // Convert to wallet's expected format
  const walletTxns = txnGroup.map((txn, index) => ({
    txn: Buffer.from(encodeUnsignedTransaction(txn)).toString('base64'),
    signers: indexesToSign.includes(index)
      ? [Address.fromString(activeAddress)]
      : [],
  }))

  // Sign with wallet provider
  const signedTxns = await walletProvider.signTxns(walletTxns)

  return signedTxns
}

const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: customSigner,
  slippage: 1,
})
await swap.execute()
```

The signer function supports two return patterns:

- **Pattern 1** (Pera, Defly, algosdk): Returns only the signed transactions as `Uint8Array[]`
- **Pattern 2** (Lute, ARC-1 compliant): Returns an array matching the transaction group length with `null` for unsigned transactions as `(Uint8Array | null)[]`

Both patterns are automatically handled by the SDK.

### Advanced Transaction Composition

Build the transaction group by adding custom transactions and ABI method calls before or after the swap using the [`SwapComposer`](#swapcomposer) instance:

```typescript
import { ABIMethod, Transaction } from 'algosdk'
import { useWallet } from '@txnlab/use-wallet-*' // react, vue, solid, or svelte

const { activeAddress, transactionSigner } = useWallet()

// Create your custom transactions
const customTxn = new Transaction({...})

// Define an ABI method call
const methodCall = {
  appID: 123456,
  method: new ABIMethod({...}),
  methodArgs: [...],
  sender: activeAddress,
  suggestedParams: await algodClient.getTransactionParams().do(),
}

// Build and execute the transaction group
const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner,
  slippage: 1,
})

const result = await swap
  .addTransaction(customTxn)      // Add transaction before swap
  .addSwapTransactions()          // Add swap transactions
  .addMethodCall(methodCall)      // Add ABI method call after swap
  .execute()                      // Sign and execute entire group
```

### Middleware for Custom Asset Requirements

Some Algorand assets require additional transactions to be added to swap groups (e.g., assets with transfer restrictions, taxes, or custom smart contract logic). The Haystack Router SDK supports a middleware system that allows these special requirements to be handled by external packages without modifying the core SDK.

Middleware can:
- Adjust quote parameters (e.g., reduce `maxGroupSize` to account for extra transactions)
- Add transactions before the swap (e.g., unfreeze account, setup calls)
- Add transactions after the swap (e.g., tax payments, cleanup calls)

```typescript
import { RouterClient } from '@txnlab/haystack-router'
import { FirstStageMiddleware } from '@firststage/deflex-middleware' // Example external package

// Initialize middleware
const firstStage = new FirstStageMiddleware({
  contractAppId: 123456,
})

// Pass middleware to RouterClient
const router = new RouterClient({
  apiKey: 'your-api-key',
  middleware: [firstStage], // Middleware is applied automatically
})

// Use normally - middleware handles everything
const quote = await router.newQuote({
  fromASAID: 0,        // ALGO
  toASAID: 789012,     // Custom asset (e.g., MOOJ, DEAL)
  amount: 1_000_000,
  address: userAddress,
})

const swap = await router.newSwap({ quote, address, signer, slippage: 1 })
await swap.execute() // Middleware transactions are automatically included
```

#### Built-in Middleware

The SDK includes `AutoOptOutMiddleware`, which automatically opts out of assets when swapping your full balance, cleaning up zero balance assets and reducing minimum balance requirements:

```typescript
import { RouterClient, AutoOptOutMiddleware } from '@txnlab/haystack-router'

const autoOptOut = new AutoOptOutMiddleware({
  excludedAssets: [31566704], // Optional: exclude specific assets like USDC
})

const router = new RouterClient({
  apiKey: 'your-api-key',
  middleware: [autoOptOut],
})

// When swapping full balance, opt-out transaction is automatically added
const quote = await router.newQuote({
  fromASAID: someAssetId,
  toASAID: 0,
  amount: fullBalance, // If this matches your full balance, asset will be opted out
  address: userAddress,
})
```

For details on creating your own middleware, see [MIDDLEWARE.md](MIDDLEWARE.md).

### Manual Asset Opt-In Detection

If you're not using `autoOptIn: true`, you can manually check if opt-in is needed:

```typescript
const router = new RouterClient({
  apiKey: 'your-api-key',
  autoOptIn: false, // Default if not provided
})

// Check if user needs to opt into the output asset
const needsOptIn = await router.needsAssetOptIn(userAddress, toAssetId)

// Include opt-in in quote if needed
const quote = await router.newQuote({
  fromAssetId,
  toAssetId,
  amount,
  optIn: needsOptIn,
})
```

### Error Handling

```typescript
import { useWallet } from '@txnlab/use-wallet-*' // react, vue, solid, or svelte

const { activeAddress, transactionSigner } = useWallet()

try {
  const quote = await router.newQuote({
    fromAssetId: 0,
    toAssetId: 31566704,
    amount: 1_000_000,
    address: activeAddress,
  })

  const swap = await router.newSwap({
    quote,
    address: activeAddress,
    signer: transactionSigner,
    slippage: 1,
  })
  const result = await swap.execute()

  console.log('Swap successful:', result)
} catch (error) {
  console.error('Swap failed:', error.message)
}
```

## API Reference

### RouterClient

The main client for interacting with the Haystack Router API.

```typescript
new RouterClient(config: ConfigParams)
```

| Option            | Description                                                  | Type                  | Default                                |
| ----------------- | ------------------------------------------------------------ | --------------------- | -------------------------------------- |
| `apiKey`          | Your Haystack Router API key                                          | `string`              | **required**                           |
| `apiBaseUrl`      | Base URL for the Haystack Router API                                  | `string`              | `https://hayrouter.txnlab.dev`            |
| `algodUri`        | Algod node URI                                               | `string`              | `https://mainnet-api.4160.nodely.dev/` |
| `algodToken`      | Algod node token                                             | `string`              | `''`                                   |
| `algodPort`       | Algod node port                                              | `string \| number`    | `443`                                  |
| `referrerAddress` | Referrer address for fee sharing (receives 25% of swap fees) | `string`              | `undefined`                            |
| `feeBps`          | Fee in basis points (0.15%, max: 300 = 3.00%)                | `number`              | `15`                                   |
| `autoOptIn`       | Auto-detect and add required opt-in transactions             | `boolean`             | `false`                                |
| `middleware`      | Array of middleware for custom asset requirements            | `SwapMiddleware[]`    | `[]`                                   |

> **Referral Program**: By providing a `referrerAddress`, you can earn 25% of the swap fees generated through your integration. The `feeBps` parameter sets the total fee charged (default: 0.15%). Learn more about the [Haystack Router Referral Program](https://txnlab.gitbook.io/haystack-router/referral-treasury/referral-program).

#### RouterClient.newQuote()

Fetch a swap quote and return a [`SwapQuote`](#swapquote) object.

```typescript
async newQuote(params: FetchQuoteParams): Promise<SwapQuote>
```

| Parameter           | Description                                | Type                              | Default         |
| ------------------- | ------------------------------------------ | --------------------------------- | --------------- |
| `fromASAID`         | Input asset ID                             | `bigint \| number`                | **required**    |
| `toASAID`           | Output asset ID                            | `bigint \| number`                | **required**    |
| `amount`            | Amount to swap in base units               | `bigint \| number`                | **required**    |
| `type`              | Quote type                                 | `'fixed-input' \| 'fixed-output'` | `'fixed-input'` |
| `address`           | User address (recommended for auto opt-in) | `string`                          | `undefined`     |
| `disabledProtocols` | Array of protocols to exclude              | `Protocol[]`                      | `[]`            |
| `maxGroupSize`      | Maximum transactions in atomic group       | `number`                          | `16`            |
| `maxDepth`          | Maximum swap hops                          | `number`                          | `4`             |
| `optIn`             | Override auto opt-in behavior              | `boolean`                         | `undefined`     |

#### RouterClient.newSwap()

Returns a [`SwapComposer`](#swapcomposer) instance for building and executing swaps.

```typescript
async newSwap(config: SwapComposerConfig): Promise<SwapComposer>
```

| Parameter  | Description                                       | Type                                                                                                                   |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `quote`    | Quote result or raw API response                  | `SwapQuote \| FetchQuoteResponse`                                                                                    |
| `address`  | Signer address                                    | `string`                                                                                                               |
| `slippage` | Slippage tolerance as percentage (e.g., 1 for 1%) | `number`                                                                                                               |
| `signer`   | Transaction signer function                       | `algosdk.TransactionSigner \| ((txnGroup: Transaction[], indexesToSign: number[]) => Promise<(Uint8Array \| null)[]>)` |
| `note`     | Optional note for the user-signed input transaction (for tracking purposes) | `Uint8Array`                                                                                             |

#### RouterClient.needsAssetOptIn()

Checks if an address needs to opt into an asset.

```typescript
async needsAssetOptIn(address: string, assetId: bigint | number): Promise<boolean>
```

| Parameter | Description               | Type               |
| --------- | ------------------------- | ------------------ |
| `address` | Algorand address to check | `string`           |
| `assetId` | Asset ID to check         | `bigint \| number` |

### SwapQuote

Plain object returned by [`newQuote()`](#routerclientnewquote). Extends the raw API response with additional metadata.

**Additional properties added by SDK:**

| Property    | Description                         | Type                  |
| ----------- | ----------------------------------- | --------------------- |
| `quote`     | Quoted amount (coerced to `bigint`) | `bigint`              |
| `amount`    | Original request amount             | `bigint`              |
| `address`   | User address (if provided)          | `string \| undefined` |
| `createdAt` | Timestamp when quote was created    | `number`              |

**All properties from API response:**

| Property            | Description                                      | Type                     |
| ------------------- | ------------------------------------------------ | ------------------------ |
| `fromASAID`         | Input asset ID                                   | `number`                 |
| `toASAID`           | Output asset ID                                  | `number`                 |
| `type`              | Quote type (`'fixed-input'` or `'fixed-output'`) | `string`                 |
| `profit`            | Profit information                               | `Profit`                 |
| `priceBaseline`     | Baseline price without fees                      | `number`                 |
| `userPriceImpact`   | Price impact for the user                        | `number \| undefined`    |
| `marketPriceImpact` | Overall market price impact                      | `number \| undefined`    |
| `usdIn`             | USD value of input                               | `number`                 |
| `usdOut`            | USD value of output                              | `number`                 |
| `route`             | Routing path information                         | `Route[]`                |
| `flattenedRoute`    | Flattened routing percentages                    | `Record<string, number>` |
| `quotes`            | Individual DEX quotes                            | `DexQuote[]`             |
| `requiredAppOptIns` | Required app opt-ins                             | `number[]`               |
| `txnPayload`        | Encrypted transaction payload                    | `TxnPayload \| null`     |
| `protocolFees`      | Fees by protocol                                 | `Record<string, number>` |
| `timing`            | Performance timing data                          | `unknown \| undefined`   |

### SwapComposer

Builder for constructing and executing atomic swap transaction groups, returned by [`newSwap()`](#routerclientnewswap).

| Method                                 | Description                                                                    | Parameters                                                     | Returns                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `addTransaction(transaction, signer?)` | Add a transaction to the atomic group                                          | `transaction: algosdk.Transaction, signer?: TransactionSigner` | `SwapComposer`                                                                     |
| `addMethodCall(methodCall, signer?)`   | Add an ABI method call to the atomic group                                     | `methodCall: MethodCall, signer?: TransactionSigner`           | `SwapComposer`                                                                     |
| `addSwapTransactions()`                | Add swap transactions to the group (includes required app opt-ins)             | None                                                           | `Promise<SwapComposer>`                                                            |
| `buildGroup()`                         | Build the transaction group and assign group IDs                               | None                                                           | `TransactionWithSigner[]`                                                          |
| `sign()`                               | Sign the transaction group                                                     | None                                                           | `Promise<Uint8Array[]>`                                                            |
| `submit()`                             | Sign and submit the transaction group                                          | None                                                           | `Promise<string[]>` (transaction IDs)                                              |
| `execute(waitRounds?)`                 | Sign, submit, and wait for confirmation                                        | `waitRounds?: number` (default: 4)                             | `Promise<{ confirmedRound: bigint, txIds: string[], methodResults: ABIResult[] }>` |
| `getStatus()`                          | Get current status: `BUILDING`, `BUILT`, `SIGNED`, `SUBMITTED`, or `COMMITTED` | None                                                           | `SwapComposerStatus`                                                               |
| `count()`                              | Get the number of transactions in the group                                    | None                                                           | `number`                                                                           |
| `getInputTransactionId()`              | Get the transaction ID of the user-signed input transaction (available after `buildGroup()`, `sign()`, or `execute()`) | None                                                           | `string \| undefined`                                                              |

## Documentation

For more information about the Haystack Order Router protocol, visit the [official documentation](https://txnlab.gitbook.io/haystack-router).

## License

MIT

## Support

- [GitHub Issues](https://github.com/TxnLab/haystack-js/issues)
- [Discord](https://discord.gg/Ek3dNyzG)
- [TxnLab](https://txnlab.dev)
