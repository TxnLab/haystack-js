# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript SDK (`@txnlab/haystack-router`) for the Haystack Order Router, which does smart order routing and DEX aggregation on Algorand. This is a pnpm workspace with the SDK in `packages/haystack/` and example apps in `examples/` (react, react-query, node-cli), which consume the SDK via `workspace:*`. Peer dependency: `algosdk ^3`.

> Migrated from `@txnlab/deflex` (TxnLab/deflex-js). See [MIGRATION.md](../MIGRATION.md).

## Commands

Run from the repo root. `build`/`test`/`typecheck` are filtered to the SDK package. `lint`/`format` cover the whole repo.

```bash
pnpm install
pnpm build                # tsdown + publint --strict
pnpm test                 # vitest run (also: test:watch, test:coverage)
pnpm lint                 # eslint (import-x/order enforced, alphabetized)
pnpm format               # prettier --check (format:fix to write)
pnpm typecheck
pnpm run ci               # build, lint, format, typecheck, test

# Single test file / single test
pnpm --filter @txnlab/haystack-router exec vitest run tests/client.test.ts
pnpm --filter @txnlab/haystack-router exec vitest run -t "test name"

# CI also builds the examples (not part of `pnpm run ci`). Requires the SDK to be built first.
pnpm --filter "./examples/**" run build
```

## Architecture

The public API is whatever `src/index.ts` re-exports: client, composer, constants, middleware, types, utils. `logger.ts` and `debug.ts` are internal.

### Swap flow

1. `RouterClient.newQuote()` runs each middleware's `shouldApply`, then `adjustQuoteParams`, then calls `fetchQuote()` (GET `/fetchQuote`) and normalizes the result to a `SwapQuote` with bigint fields. Calling `fetchQuote()` directly **skips** `adjustQuoteParams`.
2. `RouterClient.newSwap()` POSTs the quote's encrypted `txnPayload` to `/fetchExecuteSwapTxns` and returns a `SwapComposer` built on algosdk's `AtomicTransactionComposer`.
3. `SwapComposer.addSwapTransactions()` builds the group in this order: user-added txns, then middleware `beforeSwap`, then app opt-ins for `quote.requiredAppOptIns` the account lacks, then API swap txns, then middleware `afterSwap`. It checks the 16-txn group limit. `sign()`/`submit()`/`execute()` call it automatically if it hasn't run yet.
4. `execute()` records the input and output txn IDs, reads the actual output amount from the last swap app call's inner txns (exposed by `getSummary()`), and on failure logs context through `debug.ts`.

### Signing

- An API swap txn with `signature: false` is the user's input payment or axfer. It gets the configured signer and the optional `note`, and its group index is tracked for `getInputTransactionId()`.
- Every other API txn carries a logic-sig or secret-key `signature` and is re-signed locally by `createSwapSigner()`. The API's group ID is stripped and reassigned by the ATC.
- The user signer can be an `algosdk.TransactionSigner` or an ARC-1 `SignerFunction`. `defaultSigner` filters out the `null`s that ARC-1 wallets return.

### Middleware (`middleware.ts`, docs in `packages/haystack/MIDDLEWARE.md`)

`SwapMiddleware` has `name`, `version`, `shouldApply(QuoteContext)`, and optional `adjustQuoteParams`, `beforeSwap(SwapContext)`, `afterSwap(SwapContext)`. `shouldApply` is called in both the quote and swap phases. Middleware that adds txns must lower `maxGroupSize` in `adjustQuoteParams`. Built-in: `AutoOptOutMiddleware`, which appends an asset close-out when a fixed-input swap spends the full balance.

### Invariants and gotchas

- **Tinyman v1 is non-composable.** `DEPRECATED_PROTOCOLS` (`Tinyman`, `Humble`) are always added to `disabledProtocols`. `_allowNonComposableSwaps` re-enables Tinyman v1 only through `fetchQuote()`, can't be combined with opt-in, and is rejected by `newQuote()`. `addTransaction`/`addMethodCall` throw if `quote.flattenedRoute.Tinyman > 0`.
- `SwapComposerStatus` is cast directly from the ATC status, so its member order must match algosdk's `AtomicTransactionComposerStatus`.
- `Logger` is a static singleton. Each `RouterClient`/`SwapComposer` constructor overwrites the global level. Its `sanitize()` redacts `apiKey`, `algodToken`, signature values and `txnPayload`. Keep that redaction when you add log calls.
- Asset and app IDs, and amounts, are `bigint` in `QuoteContext`/`SwapContext`/`SwapQuote`. The raw API response uses numbers and strings.
- All HTTP goes through `utils.request()`, which throws `HTTPError`. Tests mock `../src/utils` or stub `algodClient.<method>().do()`. No network calls in tests.

## Commits and releases

- Conventional commits with a **lowercase** subject after the colon, e.g. `fix(client): handle timeout`. Renovate's capitalized `chore(deps): Update…` commits are the exception. Scopes: `client`, `composer`, `middleware`, `types`, `deps`, `examples`, `docs`.
- semantic-release runs on push to `main`. It derives the version from commit types (`feat`, `fix`, `refactor`, `perf` appear in release notes) and writes `packages/haystack/CHANGELOG.md` and the package version. Never edit either by hand.
