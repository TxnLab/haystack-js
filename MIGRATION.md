# Migration Guide: @txnlab/deflex → @txnlab/haystack-router

This guide will help you migrate from the deprecated `@txnlab/deflex` package to the new `@txnlab/haystack-router` package.

## Overview

The Deflex Order Router SDK has been rebranded to **Haystack Router**. All functionality remains identical—only naming has changed. This migration involves updating package names, import statements, and class/type names in your code.

## Quick Migration

### 1. Update Dependencies

```bash
npm uninstall @txnlab/deflex
npm install @txnlab/haystack-router
```

Or with pnpm:

```bash
pnpm remove @txnlab/deflex
pnpm add @txnlab/haystack-router
```

### 2. Update Imports

```typescript
// Before
import { DeflexClient, DeflexQuote } from '@txnlab/deflex'

// After
import { RouterClient, SwapQuote } from '@txnlab/haystack-router'
```

### 3. Update Class Instantiation

```typescript
// Before
const deflex = new DeflexClient({
  apiKey: 'your-api-key'
})

// After
const router = new RouterClient({
  apiKey: '1b72df7e-1131-4449-8ce1-29b79dd3f51e' // Free tier (60 requests/min)
})
```

### 4. Update Method Calls

```typescript
// Before
const quote = await deflex.newQuote({
  address: activeAddress,
  fromAssetId: 0,
  toAssetId: 31566704,
  amount: 1_000_000
})

const swap = await deflex.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner
})

// After
const quote = await router.newQuote({
  address: activeAddress,
  fromAssetId: 0,
  toAssetId: 31566704,
  amount: 1_000_000
})

const swap = await router.newSwap({
  quote,
  address: activeAddress,
  signer: transactionSigner
})
```

## Breaking Changes

### Package Name

- **Old:** `@txnlab/deflex`
- **New:** `@txnlab/haystack-router`

### Main Class

- **Old:** `DeflexClient`
- **New:** `RouterClient`

### Type Definitions

| Old Type | New Type | Purpose |
|----------|----------|---------|
| `DeflexConfig` | `Config` | Configuration object |
| `DeflexConfigParams` | `ConfigParams` | Configuration parameters |
| `DeflexQuote` | `SwapQuote` | Quote response type |
| `DeflexTransaction` | `SwapTransaction` | Transaction type |
| `DeflexSignature` | `Signature` | Signature type |

### Other Changes

- **API Endpoint:** Automatically updated to `https://hayrouter.txnlab.dev/api`
- **Repository:** Moved to `github.com/TxnLab/haystack-js`
- **Variable Naming Convention:** `deflex` → `router` (in examples and documentation)

## Search & Replace Guide

For quick migration across your codebase, use these find/replace patterns in your IDE:

### Basic Replacements

1. **Package name:**
   - Find: `@txnlab/deflex`
   - Replace: `@txnlab/haystack-router`

2. **Main client class:**
   - Find: `DeflexClient`
   - Replace: `RouterClient`

3. **Configuration types:**
   - Find: `DeflexConfig`
   - Replace: `Config`

   - Find: `DeflexConfigParams`
   - Replace: `ConfigParams`

4. **Swap types:**
   - Find: `DeflexQuote`
   - Replace: `SwapQuote`

   - Find: `DeflexTransaction`
   - Replace: `SwapTransaction`

5. **Other types:**
   - Find: `DeflexSignature`
   - Replace: `Signature`

### Variable Names

If you're using the conventional `deflex` variable name:

```typescript
// Find pattern: const deflex = new
// Replace: const router = new

// Find pattern: deflex.
// Replace: router.
```

**Important:** Be careful with case-sensitive replacements and review changes before committing.

## Environment Variables

If you're using environment variables for API keys:

```bash
# Before
DEFLEX_API_KEY=your-api-key
VITE_DEFLEX_API_KEY=your-api-key

# After
HAYSTACK_ROUTER_API_KEY=1b72df7e-1131-4449-8ce1-29b79dd3f51e
VITE_HAYSTACK_ROUTER_API_KEY=1b72df7e-1131-4449-8ce1-29b79dd3f51e
```

## No Functional Changes

**Important:** This migration involves naming changes only. All functionality, features, and APIs remain identical:

- Same methods and parameters
- Same behavior and responses
- Same middleware system
- Same swap routing capabilities
- Same DEX aggregation logic

Your existing integration will work exactly the same way after updating the names.

## Type Safety Benefits

The new `SwapTransaction` type provides better clarity and avoids potential naming collisions with the `algosdk.Transaction` type:

```typescript
import { Transaction } from 'algosdk'
import { SwapTransaction } from '@txnlab/haystack-router'

// Clear distinction between algosdk transactions and swap transactions
```

## Example Migrations

### React Example

```tsx
// Before
import { DeflexClient, type DeflexQuote } from '@txnlab/deflex'
import { useState } from 'react'

function SwapComponent() {
  const [quote, setQuote] = useState<DeflexQuote | null>(null)

  const deflex = new DeflexClient({
    apiKey: import.meta.env.VITE_DEFLEX_API_KEY
  })

  const fetchQuote = async () => {
    const result = await deflex.newQuote({...})
    setQuote(result)
  }

  // ...
}

// After
import { RouterClient, type SwapQuote } from '@txnlab/haystack-router'
import { useState } from 'react'

function SwapComponent() {
  const [quote, setQuote] = useState<SwapQuote | null>(null)

  const router = new RouterClient({
    apiKey: import.meta.env.VITE_HAYSTACK_ROUTER_API_KEY
  })

  const fetchQuote = async () => {
    const result = await router.newQuote({...})
    setQuote(result)
  }

  // ...
}
```

### Node.js Example

```typescript
// Before
import { DeflexClient } from '@txnlab/deflex'
import algosdk from 'algosdk'

const deflex = new DeflexClient({
  apiKey: process.env.DEFLEX_API_KEY || ''
})

const quote = await deflex.newQuote({
  address: account.addr,
  fromAssetId: 0,
  toAssetId: 31566704,
  amount: 1_000_000
})

// After
import { RouterClient } from '@txnlab/haystack-router'
import algosdk from 'algosdk'

const router = new RouterClient({
  apiKey: process.env.HAYSTACK_ROUTER_API_KEY || ''
})

const quote = await router.newQuote({
  address: account.addr,
  fromAssetId: 0,
  toAssetId: 31566704,
  amount: 1_000_000
})
```

## Middleware Migration

Middleware code requires minimal changes:

```typescript
// Before
import { SwapMiddleware, type DeflexQuote } from '@txnlab/deflex'

class MyMiddleware implements SwapMiddleware {
  async modifyQuoteParams(params) {
    return params
  }
}

// After
import { SwapMiddleware, type SwapQuote } from '@txnlab/haystack-router'

class MyMiddleware implements SwapMiddleware {
  async modifyQuoteParams(params) {
    return params
  }
}
```

## Getting Help

If you encounter any issues during migration:

- **GitHub Issues:** [github.com/TxnLab/haystack-js/issues](https://github.com/TxnLab/haystack-js/issues)
- **Documentation:** [github.com/TxnLab/haystack-js](https://github.com/TxnLab/haystack-js)
- **Email:** support@txnlab.dev

## Deprecation Timeline

- **Current:** `@txnlab/deflex` v1.9.0 is the final version with deprecation notices
- **Recommended:** Migrate to `@txnlab/haystack-router` v2.0.0+ as soon as convenient
- **Future:** No further updates will be published to `@txnlab/deflex`

---

Thank you for using Haystack Router! We're committed to providing the best DEX aggregation experience on Algorand.
