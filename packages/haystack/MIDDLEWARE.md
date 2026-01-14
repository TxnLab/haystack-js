# Haystack Router Middleware Developer Guide

This guide explains how to create middleware for the Haystack Router SDK to support assets with special transfer requirements.

## Table of Contents

- [Overview](#overview)
- [When to Use Middleware](#when-to-use-middleware)
- [Middleware Interface](#middleware-interface)
- [Creating Middleware](#creating-middleware)
- [Publishing Middleware](#publishing-middleware)
- [Best Practices](#best-practices)
- [Example: First Stage Assets](#example-first-stage-assets)

## Overview

Some Algorand assets require additional transactions to be included in swap transaction groups. Examples include:

- Assets with transfer taxes or fees
- Assets with freeze/unfreeze requirements
- Assets that interact with smart contracts during transfers
- Assets with custom tokenomics logic

Rather than modifying the Haystack Router SDK for each special asset type, middleware allows you to create standalone packages that integrate seamlessly with the SDK.

## When to Use Middleware

Create middleware when an asset requires:

1. **Quote Adjustments**: Modify parameters like `maxGroupSize` or `amount` before fetching quotes
2. **Pre-Swap Transactions**: Add transactions before the swap (e.g., unfreeze account, setup calls)
3. **Post-Swap Transactions**: Add transactions after the swap (e.g., tax payments, cleanup calls)

## Middleware Interface

```typescript
interface SwapMiddleware {
  // Required
  readonly name: string
  readonly version: string
  shouldApply(params: { fromASAID: bigint; toASAID: bigint }): Promise<boolean>

  // Optional hooks
  adjustQuoteParams?(params: FetchQuoteParams): Promise<FetchQuoteParams>
  beforeSwap?(context: SwapContext): Promise<TransactionWithSigner[]>
  afterSwap?(context: SwapContext): Promise<TransactionWithSigner[]>
}
```

### Required Properties

#### `name: string`
Unique identifier for your middleware (e.g., 'FirstStage', 'CustomAsset')

#### `version: string`
Semantic version of your middleware (e.g., '1.0.0')

#### `shouldApply(params): Promise<boolean>`
Determines if middleware should be applied to a given swap. Called during both quote and swap phases.

**Parameters:**
- `params.fromASAID: bigint` - Input asset ID
- `params.toASAID: bigint` - Output asset ID

**Returns:** `true` if either asset requires special handling

**Example:**
```typescript
async shouldApply(params) {
  // Check if either asset is registered in your smart contract
  const [fromRegistered, toRegistered] = await Promise.all([
    this.isRegistered(params.fromASAID),
    this.isRegistered(params.toASAID),
  ])
  return fromRegistered || toRegistered
}
```

### Optional Hooks

#### `adjustQuoteParams(params): Promise<FetchQuoteParams>`
Modify quote request parameters before fetching the quote.

> **⚠️ IMPORTANT**: If your middleware adds transactions via `beforeSwap()` or `afterSwap()`, you **MUST** implement this method and reduce `maxGroupSize` accordingly. The Haystack Router API may return routes that use all 16 available transaction slots, causing the swap to fail if you don't reserve space for the extra transactions.

**Common adjustments:**
- Reduce `maxGroupSize` to account for additional transactions (**REQUIRED** if adding txns)
- Adjust `amount` to account for fees/taxes
- Modify `disabledProtocols` if certain DEXs are incompatible

**Example:**
```typescript
async adjustQuoteParams(params) {
  const [fromTaxed, toTaxed] = await Promise.all([
    this.hasTax(params.fromASAID),
    this.hasTax(params.toASAID),
  ])

  // 3 extra transactions per taxed asset
  let maxGroupSize = params.maxGroupSize ?? 16
  if (fromTaxed) maxGroupSize -= 3
  if (toTaxed) maxGroupSize -= 3

  // Adjust amount for input tax (e.g., 9% tax)
  let amount = params.amount
  if (fromTaxed) {
    const taxRate = await this.getTaxRate(params.fromASAID)
    amount = this.calculateWithTax(amount, taxRate)
  }

  return { ...params, maxGroupSize, amount }
}
```

#### `beforeSwap(context): Promise<TransactionWithSigner[]>`
Add transactions before the swap transactions.

**Use cases:**
- Unfreeze accounts
- Initialize smart contract state
- Setup transactions

**Example:**
```typescript
async beforeSwap(context) {
  const txns: TransactionWithSigner[] = []

  if (await this.needsUnfreeze(context.fromASAID)) {
    const unfreezeCall = makeApplicationNoOpTxnFromObject({
      sender: context.address,
      appIndex: this.appId,
      appArgs: [new Uint8Array(Buffer.from('unfreeze'))],
      suggestedParams: context.suggestedParams,
    })

    txns.push({
      txn: unfreezeCall,
      signer: context.signer, // User's signer from context
    })
  }

  return txns
}
```

#### `afterSwap(context): Promise<TransactionWithSigner[]>`
Add transactions after the swap transactions.

**Use cases:**
- Tax/fee payments
- Refreeze accounts
- Cleanup transactions

**Example:**
```typescript
async afterSwap(context) {
  const txns: TransactionWithSigner[] = []

  if (await this.hasTax(context.fromASAID)) {
    const taxAmount = await this.calculateTax(context)

    // Tax payment transaction
    const taxPayment = makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: context.address,
      receiver: this.taxReceiver,
      amount: taxAmount,
      assetIndex: context.fromASAID,
      suggestedParams: context.suggestedParams,
    })

    // Refreeze call
    const refreezeCall = makeApplicationNoOpTxnFromObject({
      sender: context.address,
      appIndex: this.appId,
      appArgs: [new Uint8Array(Buffer.from('refreeze'))],
      suggestedParams: context.suggestedParams,
    })

    txns.push(
      { txn: taxPayment, signer: context.signer },
      { txn: refreezeCall, signer: context.signer },
    )
  }

  return txns
}
```

### SwapContext

The context object provided to `beforeSwap` and `afterSwap` hooks:

```typescript
interface SwapContext {
  readonly quote: SwapQuote           // The quote result
  readonly address: string              // User's address
  readonly algodClient: Algodv2         // Algod client for queries
  readonly suggestedParams: SuggestedParams  // Transaction parameters
  readonly fromASAID: bigint            // Input asset ID
  readonly toASAID: bigint              // Output asset ID
  readonly signer: TransactionSigner    // User's transaction signer
}
```

## Creating Middleware

### 1. Project Setup

Create a new npm package:

```bash
npm init -y
npm install --save-peer @txnlab/haystack-router algosdk
npm install --save-dev typescript @types/node
```

### 2. Implement the Interface

Create your middleware class:

```typescript
// src/index.ts
import type {
  SwapMiddleware,
  SwapContext,
  FetchQuoteParams,
} from '@txnlab/haystack-router'
import type { TransactionWithSigner } from 'algosdk'

export interface CustomAssetConfig {
  contractAppId: number | bigint
}

export class CustomAssetMiddleware implements SwapMiddleware {
  readonly name = 'CustomAsset'
  readonly version = '1.0.0'

  private contractAppId: number | bigint

  constructor(config: CustomAssetConfig) {
    this.contractAppId = config.contractAppId
  }

  async shouldApply(params: {
    fromASAID: bigint
    toASAID: bigint
  }): Promise<boolean> {
    // Check if either asset is registered
    const [fromRegistered, toRegistered] = await Promise.all([
      this.isAssetRegistered(params.fromASAID),
      this.isAssetRegistered(params.toASAID),
    ])
    return fromRegistered || toRegistered
  }

  async adjustQuoteParams(
    params: FetchQuoteParams
  ): Promise<FetchQuoteParams> {
    // Implement quote adjustments
    return params
  }

  async beforeSwap(
    context: SwapContext
  ): Promise<TransactionWithSigner[]> {
    // Implement before-swap transactions
    return []
  }

  async afterSwap(
    context: SwapContext
  ): Promise<TransactionWithSigner[]> {
    // Implement after-swap transactions
    return []
  }

  private async isAssetRegistered(assetId: bigint): Promise<boolean> {
    // Query smart contract to check registration
    // Cache results for performance
    return false
  }
}
```

### 3. Add Caching

For performance, cache smart contract queries:

```typescript
export class CustomAssetMiddleware implements SwapMiddleware {
  private assetCache = new Map<bigint, boolean>()
  private taxRateCache = new Map<bigint, number>()

  private async isAssetRegistered(assetId: bigint): Promise<boolean> {
    if (this.assetCache.has(assetId)) {
      return this.assetCache.get(assetId)!
    }

    // Query smart contract
    const isRegistered = await this.queryContract(assetId)
    this.assetCache.set(assetId, isRegistered)

    return isRegistered
  }
}
```

### 4. Handle Errors Gracefully

```typescript
async beforeSwap(context: SwapContext): Promise<TransactionWithSigner[]> {
  try {
    // Your logic here
    return txns
  } catch (error) {
    console.error(`${this.name} middleware error:`, error)
    // Return empty array to avoid breaking the swap
    return []
  }
}
```

## Publishing Middleware

### Package.json

```json
{
  "name": "@your-org/haystack-router-middleware",
  "version": "1.0.0",
  "description": "Haystack Router middleware for CustomAsset",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "keywords": ["deflex", "algorand", "dex", "middleware"],
  "peerDependencies": {
    "@txnlab/haystack-router": "^1.2.0",
    "algosdk": "^3.0.0"
  }
}
```

### README.md

Include clear usage instructions:

````markdown
# CustomAsset Haystack Router Middleware

Middleware for swapping CustomAsset tokens via Deflex.

## Installation

```bash
npm install @your-org/haystack-router-middleware @txnlab/haystack-router algosdk
```

## Usage

```typescript
import { RouterClient } from '@txnlab/haystack-router'
import { CustomAssetMiddleware } from '@your-org/haystack-router-middleware'

const middleware = new CustomAssetMiddleware({
  contractAppId: 123456,
})

const router = new RouterClient({
  apiKey: 'your-api-key',
  middleware: [middleware],
})

// Use normally
const quote = await router.newQuote({ ... })
const swap = await router.newSwap({ ... })
await swap.execute()
```
````

## Best Practices

### 1. Always Adjust maxGroupSize When Adding Transactions ⚠️

**This is the most critical requirement for middleware developers.**

If your middleware adds ANY transactions via `beforeSwap()` or `afterSwap()`, you **MUST** implement `adjustQuoteParams()` and reduce `maxGroupSize` by the exact number of transactions you add.

**Why this is critical:**
- Algorand has a hard limit of 16 transactions per atomic group
- Haystack Router API will optimize routes to use as many transactions as the `maxGroupSize` allows
- If Deflex returns a 16-transaction route and you try to add more, the transaction will **fail**

**Example:**
```typescript
async adjustQuoteParams(params: FetchQuoteParams): Promise<FetchQuoteParams> {
  // If you add 3 transactions per asset (unfreeze, tax, refreeze)
  let maxGroupSize = params.maxGroupSize ?? 16

  const fromNeedsExtra = await this.needsExtraTransactions(params.fromASAID)
  const toNeedsExtra = await this.needsExtraTransactions(params.toASAID)

  if (fromNeedsExtra) maxGroupSize -= 3
  if (toNeedsExtra) maxGroupSize -= 3

  return { ...params, maxGroupSize }
}
```

### 2. Disable SDK Asset Opt-Ins When Adding Your Own

The SDK's `autoOptIn: true` config automatically adds opt-in transactions when needed. If your middleware adds its own opt-in (e.g., for ordering requirements), set `optIn: false` in `adjustQuoteParams()`:

```typescript
async adjustQuoteParams(params: FetchQuoteParams): Promise<FetchQuoteParams> {
  const needsOptIn = await this.needsAssetOptIn(params.toASAID)

  return {
    ...params,
    maxGroupSize: needsOptIn ? (params.maxGroupSize ?? 16) - 1 : params.maxGroupSize,
    optIn: false,  // Disable SDK's opt-in
  }
}
```

### 3. Additional Best Practices
- **Minimize transactions**: Only add when absolutely necessary
- **Cache queries**: Avoid redundant smart contract calls
- **Handle errors**: Return empty arrays to avoid breaking swaps
- **Test thoroughly**: Test with both, one, or neither asset requiring middleware
- **Document assets**: List supported asset IDs and versions clearly

## Example: First Stage Assets

Here's a complete example for assets using the First Stage contract:

```typescript
import type {
  SwapMiddleware,
  SwapContext,
  FetchQuoteParams,
} from '@txnlab/haystack-router'
import {
  makeApplicationNoOpTxnFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  type Algodv2,
  type TransactionWithSigner,
} from 'algosdk'

interface AssetTaxInfo {
  taxRate: number // Basis points (e.g., 900 = 9%)
  taxReceiver: string
}

export class FirstStageMiddleware implements SwapMiddleware {
  readonly name = 'FirstStage'
  readonly version = '1.0.0'

  private contractAppId: number | bigint
  private assetInfoCache = new Map<bigint, AssetTaxInfo | null>()

  constructor(config: { contractAppId: number | bigint }) {
    this.contractAppId = config.contractAppId
  }

  async shouldApply(params: {
    fromASAID: bigint
    toASAID: bigint
  }): Promise<boolean> {
    const [fromInfo, toInfo] = await Promise.all([
      this.getAssetTaxInfo(params.fromASAID),
      this.getAssetTaxInfo(params.toASAID),
    ])
    return fromInfo !== null || toInfo !== null
  }

  async adjustQuoteParams(
    params: FetchQuoteParams
  ): Promise<FetchQuoteParams> {
    const [fromInfo, toInfo] = await Promise.all([
      this.getAssetTaxInfo(BigInt(params.fromASAID)),
      this.getAssetTaxInfo(BigInt(params.toASAID)),
    ])

    // Reduce maxGroupSize: 3 transactions per taxed asset
    let maxGroupSize = params.maxGroupSize ?? 16
    if (fromInfo) maxGroupSize -= 3
    if (toInfo) maxGroupSize -= 3

    // Adjust amount for input tax
    let amount = params.amount
    if (fromInfo && params.type === 'fixed-input') {
      amount = this.applyTax(amount, fromInfo.taxRate)
    }

    return { ...params, maxGroupSize, amount }
  }

  async beforeSwap(
    context: SwapContext
  ): Promise<TransactionWithSigner[]> {
    const txns: TransactionWithSigner[] = []

    // Unfreeze for input asset
    const fromInfo = await this.getAssetTaxInfo(context.fromASAID)
    if (fromInfo) {
      txns.push(this.createUnfreezeTxn(context))
    }

    // Unfreeze for output asset
    const toInfo = await this.getAssetTaxInfo(context.toASAID)
    if (toInfo) {
      txns.push(this.createUnfreezeTxn(context))
    }

    return txns
  }

  async afterSwap(
    context: SwapContext
  ): Promise<TransactionWithSigner[]> {
    const txns: TransactionWithSigner[] = []

    const fromInfo = await this.getAssetTaxInfo(context.fromASAID)
    if (fromInfo) {
      const taxAmount = this.calculateTaxAmount(context, fromInfo)
      txns.push(
        this.createTaxPaymentTxn(context, fromInfo, taxAmount),
        this.createRefreezeTxn(context),
      )
    }

    const toInfo = await this.getAssetTaxInfo(context.toASAID)
    if (toInfo) {
      const taxAmount = this.calculateTaxAmount(context, toInfo)
      txns.push(
        this.createTaxPaymentTxn(context, toInfo, taxAmount),
        this.createRefreezeTxn(context),
      )
    }

    return txns
  }

  private async getAssetTaxInfo(
    assetId: bigint
  ): Promise<AssetTaxInfo | null> {
    if (this.assetInfoCache.has(assetId)) {
      return this.assetInfoCache.get(assetId)!
    }

    try {
      // Query First Stage contract for asset info
      // This is simplified - actual implementation would query box storage
      const info: AssetTaxInfo | null = null // Replace with actual query
      this.assetInfoCache.set(assetId, info)
      return info
    } catch {
      this.assetInfoCache.set(assetId, null)
      return null
    }
  }

  private applyTax(amount: bigint | number, taxRateBps: number): bigint {
    const amt = BigInt(amount)
    const tax = (amt * BigInt(taxRateBps)) / 10000n
    return amt + tax
  }

  private calculateTaxAmount(
    context: SwapContext,
    info: AssetTaxInfo
  ): bigint {
    // Simplified - actual implementation would calculate based on quote
    return (BigInt(context.quote.amount) * BigInt(info.taxRate)) / 10000n
  }

  private createUnfreezeTxn(
    context: SwapContext
  ): TransactionWithSigner {
    const txn = makeApplicationNoOpTxnFromObject({
      sender: context.address,
      appIndex: this.contractAppId,
      appArgs: [new Uint8Array(Buffer.from('unfreeze'))],
      suggestedParams: context.suggestedParams,
    })

    return { txn, signer: context.signer }
  }

  private createTaxPaymentTxn(
    context: SwapContext,
    info: AssetTaxInfo,
    amount: bigint
  ): TransactionWithSigner {
    const txn = makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: context.address,
      receiver: info.taxReceiver,
      amount,
      assetIndex: context.fromASAID,
      suggestedParams: context.suggestedParams,
    })

    return { txn, signer: context.signer }
  }

  private createRefreezeTxn(
    context: SwapContext
  ): TransactionWithSigner {
    const txn = makeApplicationNoOpTxnFromObject({
      sender: context.address,
      appIndex: this.contractAppId,
      appArgs: [new Uint8Array(Buffer.from('refreeze'))],
      suggestedParams: context.suggestedParams,
    })

    return { txn, signer: context.signer }
  }
}
```

## Questions?

- [GitHub Issues](https://github.com/TxnLab/haystack-js/issues)
- [Discord](https://discord.gg/Ek3dNyzG)
