/**
 * Supported DEX protocols for swap routing
 */
export enum Protocol {
  TinymanV2 = 'TinymanV2',
  Humble = 'Humble',
  Algofi = 'Algofi',
  Algomint = 'Algomint',
  Pact = 'Pact',
  Folks = 'Folks',
  TAlgo = 'TAlgo',
}

/**
 * Deprecated protocols that are automatically excluded from routing
 *
 * @internal
 */
export const DEPRECATED_PROTOCOLS = ['Tinyman'] as const

/** Default Algod node URI for mainnet */
export const DEFAULT_ALGOD_URI = 'https://mainnet-api.4160.nodely.dev/'

/** Default Algod node token (empty for public nodes) */
export const DEFAULT_ALGOD_TOKEN = ''

/** Default Algod node port */
export const DEFAULT_ALGOD_PORT = 443

/** Default Haystack Router API base URL */
export const DEFAULT_API_BASE_URL = 'https://hayrouter.txnlab.dev/api'

/** HTTP header that carries the Haystack Router API key */
export const API_KEY_HEADER = 'X-API-Key'

/** Default fee in basis points (0.10%) */
export const DEFAULT_FEE_BPS = 10

/** Maximum allowed fee in basis points (3.00%) */
export const MAX_FEE_BPS = 300

/** Default maximum transaction group size */
export const DEFAULT_MAX_GROUP_SIZE = 16

/** Default maximum routing depth (number of hops) */
export const DEFAULT_MAX_DEPTH = 4

/** Default auto opt-in setting (automatic asset/app opt-in detection) */
export const DEFAULT_AUTO_OPT_IN = false

/** Default debug level (no debug logging) */
export const DEFAULT_DEBUG_LEVEL = 'none' as const

/**
 * What a Falcon (post-quantum) signature adds to its transaction's fee, in
 * microAlgos: algod charges a transaction it signs 3 fee units instead of 1
 */
export const FALCON_EXTRA_FEE = 2_000n

/** Default number of rounds to wait for transaction confirmation */
export const DEFAULT_CONFIRMATION_ROUNDS = 10
