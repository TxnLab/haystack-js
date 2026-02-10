# Haystack Router SDK - Node.js CLI Example

This example demonstrates how to use the Haystack Router SDK in a Node.js command-line application with a custom transaction signer.

## Features

- Command-line interface for executing swaps
- Custom signer implementation using `algosdk.Account`
- Environment variable configuration
- Detailed console output with swap progress
- TypeScript with strict mode enabled

## Prerequisites

- **Haystack Router API Key** - A free tier key is included in `.env.example` (60 requests/min). For production rate limits, request a key from [support@txnlab.dev](mailto:support@txnlab.dev).
- algosdk 3.0.0 or later (peer dependency)
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

3. Configure your `.env` file (the API key is pre-configured with the free tier):

```env
# Haystack Router API key - Free tier (60 requests/min)
HAYSTACK_ROUTER_API_KEY=1b72df7e-1131-4449-8ce1-29b79dd3f51e

# Required: Your 25-word account mnemonic
# WARNING: Keep this file private and never commit it!
ACCOUNT_MNEMONIC="your twenty five word mnemonic phrase goes here"

# Optional: Swap parameters (defaults shown)
FROM_ASSET_ID=0           # ALGO
TO_ASSET_ID=31566704      # USDC
AMOUNT=1000000            # 1 ALGO (in microAlgos)
SLIPPAGE=1                # 1% slippage tolerance
```

**⚠️ SECURITY WARNING**: Never commit your `.env` file or share your mnemonic phrase!

## Development

Build and run:

```bash
pnpm dev
```

Or build separately:

```bash
pnpm build
pnpm start
```

## Usage

Once configured, simply run:

```bash
pnpm dev
```

The CLI will:
1. Load configuration from `.env`
2. Display swap parameters
3. Fetch a quote from Haystack Router API
4. Show quote details (output amount, price impact, routing)
5. Execute the swap
6. Display transaction IDs and confirmation

### Example Output

```
🚀 Haystack Router CLI Swap Tool

📋 Configuration:
   From Asset: 0
   To Asset: 31566704
   Amount: 1.000000 (1000000 microunits)
   Slippage: 1%

💼 Using account: ABCD...XYZ

📊 Fetching quote...
✅ Quote received:
   Expected output: 0.123456 tokens
   Price impact: 0.0123%
   USD In: $1.00
   USD Out: $0.99
   Route paths: 2
   Flattened route: { 'Tinyman': 0.6, 'Folks': 0.4 }

🔄 Executing swap...
✨ Swap completed successfully!
   Confirmed in round: 12345678
   Transaction IDs:
     1. ABC123...
     2. DEF456...

🔗 View on allo: https://allo.info/tx/ABC123...
```

## Custom Signer Implementation

This example shows how to implement a custom transaction signer without using `@txnlab/use-wallet`:

```typescript
async function createAccountSigner(mnemonic: string) {
  const account = algosdk.mnemonicToSecretKey(mnemonic)

  return async (
    txnGroup: algosdk.Transaction[],
    indexesToSign: number[]
  ): Promise<Uint8Array[]> => {
    return indexesToSign.map((index) => {
      return algosdk.signTransaction(txnGroup[index], account.sk).blob
    })
  }
}
```

The signer receives:
- `txnGroup`: The complete transaction group
- `indexesToSign`: Array of indexes indicating which transactions need signing

This pattern can be adapted for other signing methods (KMD, hardware wallets, etc.).

## Notes

- This example uses mainnet (real assets!)
- Make sure you have sufficient ALGO/assets in your account
- The SDK automatically handles app and asset opt-ins when needed
- All swap parameters can be configured via environment variables
- Never commit your `.env` file with real credentials
