#!/usr/bin/env node

import { config } from 'dotenv'
import algosdk from 'algosdk'
import { RouterClient } from '@txnlab/haystack-router'

// Load environment variables
config()

interface SwapConfig {
  apiKey: string
  mnemonic: string
  fromAssetId: number
  toAssetId: number
  amount: bigint
  slippage: number
}

/**
 * Custom transaction signer using algosdk.Account
 * This is an alternative to use-wallet for Node.js environments
 */
async function createAccountSigner(mnemonic: string) {
  const account = algosdk.mnemonicToSecretKey(mnemonic)

  return async (
    txnGroup: algosdk.Transaction[],
    indexesToSign: number[],
  ): Promise<Uint8Array[]> => {
    return indexesToSign.map((index) => {
      // Sign the transaction at the specified index
      return algosdk.signTransaction(txnGroup[index], account.sk).blob
    })
  }
}

/**
 * Parse and validate environment variables
 */
function parseConfig(): SwapConfig {
  const apiKey = process.env.HAYSTACK_ROUTER_API_KEY
  const mnemonic = process.env.ACCOUNT_MNEMONIC
  const fromAssetId = parseInt(process.env.FROM_ASSET_ID || '0', 10)
  const toAssetId = parseInt(process.env.TO_ASSET_ID || '31566704', 10)
  const amount = BigInt(process.env.AMOUNT || '1000000')
  const slippage = parseFloat(process.env.SLIPPAGE || '1')

  if (!apiKey) {
    throw new Error('HAYSTACK_ROUTER_API_KEY is required in .env file')
  }

  if (!mnemonic) {
    throw new Error('ACCOUNT_MNEMONIC is required in .env file')
  }

  return {
    apiKey,
    mnemonic,
    fromAssetId,
    toAssetId,
    amount,
    slippage,
  }
}

/**
 * Format asset amount for display
 */
function formatAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals)
  const whole = amount / divisor
  const fraction = amount % divisor
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`
}

/**
 * Main swap execution function
 */
async function executeSwap() {
  console.log('🚀 Haystack Router CLI Swap Tool\n')

  try {
    // Parse configuration
    const config = parseConfig()
    console.log('📋 Configuration:')
    console.log(`   From Asset: ${config.fromAssetId}`)
    console.log(`   To Asset: ${config.toAssetId}`)
    console.log(
      `   Amount: ${formatAmount(config.amount)} (${config.amount} microunits)`,
    )
    console.log(`   Slippage: ${config.slippage}%\n`)

    // Initialize Haystack Router client
    const router = new RouterClient({
      apiKey: config.apiKey,
      autoOptIn: true,
    })

    // Get account from mnemonic
    const account = algosdk.mnemonicToSecretKey(config.mnemonic)
    console.log(`💼 Using account: ${account.addr}\n`)

    // Create custom signer
    const signer = await createAccountSigner(config.mnemonic)

    // Fetch quote
    console.log('📊 Fetching quote...')
    const quote = await router.newQuote({
      fromASAID: config.fromAssetId,
      toASAID: config.toAssetId,
      amount: config.amount,
      address: account.addr.toString(),
    })

    console.log('✅ Quote received:')
    console.log(`   Expected output: ${formatAmount(quote.quote)} tokens`)
    console.log(
      `   Price impact: ${quote.userPriceImpact?.toFixed(4) ?? 'N/A'}%`,
    )
    console.log(`   USD In: $${quote.usdIn.toFixed(2)}`)
    console.log(`   USD Out: $${quote.usdOut.toFixed(2)}`)
    console.log(`   Route paths: ${quote.route.length}`)
    console.log(`   Flattened route:`, quote.flattenedRoute)
    console.log()

    // Execute swap
    console.log('🔄 Executing swap...')
    const swap = await router.newSwap({
      quote,
      address: account.addr.toString(),
      signer,
      slippage: config.slippage,
    })

    const result = await swap.execute()

    console.log('✨ Swap completed successfully!')
    console.log(`   Confirmed in round: ${result.confirmedRound}`)
    console.log(`   Transaction IDs:`)
    result.txIds.forEach((txId, index) => {
      console.log(`     ${index + 1}. ${txId}`)
    })
    console.log()
    console.log(`🔗 View on allo: https://allo.info/tx/${result.txIds[0]}`)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run the swap
executeSwap()
