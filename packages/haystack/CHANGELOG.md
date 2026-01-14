# [2.0.0](https://github.com/TxnLab/haystack-js/compare/v1.8.0...v2.0.0) (2026-01-14)


* feat!: rebrand Deflex to Haystack Router ([d227c06](https://github.com/TxnLab/haystack-js/commit/d227c06e61b0a4dd67b70cef14a020b7cd7cf787))


### BREAKING CHANGES

* Package renamed from @txnlab/deflex to @txnlab/haystack-router

- Renamed DeflexClient to RouterClient
- Renamed DeflexQuote to SwapQuote
- Renamed DeflexTransaction to SwapTransaction
- Renamed DeflexConfig to Config
- Renamed DeflexConfigParams to ConfigParams
- Renamed DeflexSignature to Signature
- Updated API endpoint to hayrouter.txnlab.dev
- Repository moved to TxnLab/haystack-js
- No functional changes, only naming

See MIGRATION.md for migration guide

# [2.0.0](https://github.com/TxnLab/haystack-js/compare/v1.8.0...v2.0.0) (2026-01-14)


## BREAKING CHANGES

### Package Renamed: @txnlab/deflex → @txnlab/haystack-router

The Deflex Order Router SDK has been rebranded to **Haystack Router**. This is a **naming-only change** with no functional modifications.

**What Changed:**
- Package name: `@txnlab/deflex` → `@txnlab/haystack-router`
- Main class: `DeflexClient` → `RouterClient`
- Types: `DeflexQuote` → `SwapQuote`, `DeflexTransaction` → `SwapTransaction`, etc.
- API endpoint: `https://deflex.txnlab.dev/api` → `https://hayrouter.txnlab.dev/api`
- Repository: `TxnLab/deflex-js` → `TxnLab/haystack-js`

**What Didn't Change:**
- All functionality remains identical
- Same methods and parameters
- Same behavior and responses
- Same middleware system
- Same DEX aggregation capabilities

**Migration:**
See the [migration guide](https://github.com/TxnLab/haystack-js/blob/main/MIGRATION.md) for detailed instructions.

---

## Historical Releases (as @txnlab/deflex)

The following releases were published under the `@txnlab/deflex` package name.
This package has been renamed to `@txnlab/haystack-router` as of v2.0.0.

# [1.8.0](https://github.com/TxnLab/haystack-js/compare/v1.7.0...v1.8.0) (2026-01-13)


### Features

* **client:** add debug mode with configurable log levels ([#41](https://github.com/TxnLab/haystack-js/issues/41)) ([420c41d](https://github.com/TxnLab/haystack-js/commit/420c41d2fa865b4ff0963e1af53c306531dfe9b8))

# [1.7.0](https://github.com/TxnLab/haystack-js/compare/v1.6.0...v1.7.0) (2026-01-10)


### Features

* add getSummary() method for exact swap amounts and fees ([#38](https://github.com/TxnLab/haystack-js/issues/38)) ([b90cf49](https://github.com/TxnLab/haystack-js/commit/b90cf493ebcb613972acc6754757cefb015a45eb))

# [1.6.0](https://github.com/TxnLab/haystack-js/compare/v1.5.0...v1.6.0) (2025-12-15)


### Features

* add note field support and input transaction ID retrieval ([#30](https://github.com/TxnLab/haystack-js/issues/30)) ([904dbcc](https://github.com/TxnLab/haystack-js/commit/904dbcc6fcf4d6558d235f49f8cd78c7f640b7fb))

# [1.5.0](https://github.com/TxnLab/haystack-js/compare/v1.4.1...v1.5.0) (2025-11-22)


### Features

* add internal _allowNonComposableSwaps parameter for Tinyman v1 support ([#25](https://github.com/TxnLab/haystack-js/issues/25)) ([e70338a](https://github.com/TxnLab/haystack-js/commit/e70338afac58c9f0a13d72fdc0233a178bcd63fe))

## [1.4.1](https://github.com/TxnLab/haystack-js/compare/v1.4.0...v1.4.1) (2025-11-22)


### Bug Fixes

* update default fee and confirmation rounds in constants ([#24](https://github.com/TxnLab/haystack-js/issues/24)) ([e166066](https://github.com/TxnLab/haystack-js/commit/e16606633240020da78951454e40a57a4354b8de))

# [1.4.0](https://github.com/TxnLab/haystack-js/compare/v1.3.0...v1.4.0) (2025-11-06)


### Features

* add AutoOptOutMiddleware for automatic asset opt-out on full balance swaps ([#20](https://github.com/TxnLab/haystack-js/issues/20)) ([e1bbdaa](https://github.com/TxnLab/haystack-js/commit/e1bbdaa9f3459c8587a00bb24b63b7a20f16e2f5))

# [1.3.0](https://github.com/TxnLab/haystack-js/compare/v1.2.0...v1.3.0) (2025-11-06)


### Features

* add middleware system for custom asset support ([#19](https://github.com/TxnLab/haystack-js/issues/19)) ([f75963c](https://github.com/TxnLab/haystack-js/commit/f75963c96933a85f15ca94d76bd1a2a5da4f383c))

# [1.2.0](https://github.com/TxnLab/haystack-js/compare/v1.1.0...v1.2.0) (2025-11-04)


### Features

* refactor SwapComposer to use AtomicTransactionComposer internally ([#17](https://github.com/TxnLab/haystack-js/issues/17)) ([cebb16c](https://github.com/TxnLab/haystack-js/commit/cebb16c4f764ecb563915fadf5699b394d579b72))

# [1.1.0](https://github.com/TxnLab/haystack-js/compare/v1.0.0...v1.1.0) (2025-11-01)


### Features

* **deps:** change algosdk to peer dependency and remove algokit-utils ([#7](https://github.com/TxnLab/haystack-js/issues/7)) ([2275607](https://github.com/TxnLab/haystack-js/commit/2275607aa513a6db49b3f6672891bf8437c552df))

# 1.0.0 (2025-10-31)


### Features

* add configurable apiBaseUrl option to RouterClient ([606ff97](https://github.com/TxnLab/haystack-js/commit/606ff97f0efce1ba45d4ae537f7f24b08608ef91))
* add React Query example with automatic quote fetching ([2264d09](https://github.com/TxnLab/haystack-js/commit/2264d0916eb67f75d2286b935e8d9fa81a1c4e4e))
* add SwapQuote wrapper class with convenience methods ([e9dcfd6](https://github.com/TxnLab/haystack-js/commit/e9dcfd6629b3a9003ecc74746ed00e9d9e1d08df))
* add runtime validation for SwapComposer required parameters ([689b538](https://github.com/TxnLab/haystack-js/commit/689b53814a8b6a8f1d239e4699548295a3526cf7))
* replace signSwap with SwapComposer and newSwap factory ([90b97bb](https://github.com/TxnLab/haystack-js/commit/90b97bbf5d3cbaf57597af32670114ff46300b36))
* add automatic asset opt-in detection and handling ([13a1ed7](https://github.com/TxnLab/haystack-js/commit/13a1ed75798758c81ae78d0c8805b06a0e2a3923))
* add swap transaction signing functionality ([3721ee2](https://github.com/TxnLab/haystack-js/commit/3721ee272a71aafd94d298dd41e24222d26f9474))
* add RouterClient and implement quote fetching ([0ca3ad6](https://github.com/TxnLab/haystack-js/commit/0ca3ad629df102f87d7a767b55c42746de716d7d))


### Bug Fixes

* correct pnpm script references in release workflow ([8f7acad](https://github.com/TxnLab/haystack-js/commit/8f7acad82f25f0f90b0ff9e6013968eaa091fe80))
* implement ARC-1 compliant transaction signing ([7771d6d](https://github.com/TxnLab/haystack-js/commit/7771d6daa18599ca09a8cacef7785666d3229836))
* only include optIn param when explicitly set as boolean ([dd245dc](https://github.com/TxnLab/haystack-js/commit/dd245dc6ed5b7c7a5bdbff2d2530ee5e19e36c81))
* accept null for address parameter in FetchQuoteParams ([44f4fae](https://github.com/TxnLab/haystack-js/commit/44f4fae6b5c808cd4d8e84538a8d9a56595d5854))
* improve fee validation error message with valid range ([9e1e7a1](https://github.com/TxnLab/haystack-js/commit/9e1e7a1d11d8c6d2dda9b19ba2af02b88fa5375a))
* update default auto opt-in setting to false ([fed18a4](https://github.com/TxnLab/haystack-js/commit/fed18a42d2a49a106dcc148ae98db4edf2ca5f9c))


### Code Refactoring

* move signer to SwapComposer configuration ([1bea32f](https://github.com/TxnLab/haystack-js/commit/1bea32fe07d58a7658851624c98f7cbc1d576d51))


### BREAKING CHANGES

* Signer must now be passed to `newSwap()` config instead
of to `sign()`, `submit()`, or `execute()` methods.
