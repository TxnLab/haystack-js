# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Haystack Router SDK is a TypeScript/JavaScript SDK for the Haystack Order Router - smart order routing and DEX aggregation on Algorand. This is a pnpm workspace monorepo containing the SDK package and example implementations.

> **Note:** This SDK was migrated from `@txnlab/deflex` (TxnLab/deflex-js) to `@txnlab/haystack-router` (TxnLab/haystack-js) as part of a rebranding effort. See [MIGRATION.md](../MIGRATION.md) for details on migrating from the old package.

## Commands

```bash
# Install dependencies
pnpm install

# Build the SDK (runs tsdown and publint)
pnpm build

# Run tests
pnpm test
pnpm test:watch          # Watch mode
pnpm test:coverage       # With coverage

# Run a single test file
pnpm --filter @txnlab/haystack-router vitest run tests/client.test.ts

# Linting and formatting
pnpm lint                # ESLint
pnpm format              # Check formatting
pnpm format:fix          # Fix formatting

# Type checking
pnpm typecheck

# Run all CI checks
pnpm run ci
```

## Architecture

### SDK Package (`packages/haystack/`)

The SDK exports from `src/index.ts`:

- **client.ts** - `RouterClient` class: Main entry point for interacting with the Haystack Router API. Handles quote fetching, swap transaction creation, and automatic asset opt-in detection.

- **composer.ts** - `SwapComposer` class: Builder pattern for constructing atomic transaction groups. Manages transaction lifecycle (BUILDING → BUILT → SIGNED → SUBMITTED → COMMITTED). Supports adding custom transactions and ABI method calls before/after swaps.

- **middleware.ts** - `SwapMiddleware` interface: Plugin system for extending swap functionality. Middleware can modify quote parameters, add transactions before/after swaps. Includes built-in `AutoOptOutMiddleware`.

- **types.ts** - TypeScript types for API requests/responses, quotes, transactions.

- **constants.ts** - Default configuration values and protocol constants.

### Workspace Structure

```
packages/haystack/     # Main SDK package (@txnlab/haystack-router)
examples/
  react/             # React + Vite example
  react-query/       # React + TanStack Query example
  node-cli/          # Node.js CLI example
```

Examples use `"@txnlab/haystack-router": "workspace:*"` to reference the local SDK.

## Key Patterns

### Transaction Signing

The SDK accepts both `algosdk.TransactionSigner` and ARC-1 compliant signer functions. The `SignerFunction` type in composer.ts handles both patterns.

### Middleware System

Middleware implements `SwapMiddleware` interface with optional hooks:
- `shouldApply(context)` - Determine if middleware applies to a swap
- `modifyQuoteParams(params)` - Adjust quote parameters (e.g., reduce maxGroupSize)
- `getPreSwapTransactions(context)` - Add transactions before swap
- `getPostSwapTransactions(context)` - Add transactions after swap

### Peer Dependencies

The SDK requires `algosdk ^3.0.0` as a peer dependency.
