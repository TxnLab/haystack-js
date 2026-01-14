# Haystack Router SDK Examples

This directory contains complete example implementations demonstrating how to integrate the Haystack Router SDK into different types of applications.

## Available Examples

### [React](./react)

A simple React application demonstrating basic Haystack Router SDK integration.

**Key Features:**

- React 18 with TypeScript and Vite
- Multiple wallet support (Pera, Defly, Lute)
- Complete swap interface with quote display

[View Example →](./react/README.md)

---

### [React Query](./react-query)

An advanced React application showcasing TanStack Query (React Query) integration.

**Key Features:**

- Automatic quote fetching with 500ms debounce
- Real-time quote updates (refreshes every 15 seconds)
- `useQuery` hook for quotes, `useMutation` hook for swaps
- Optimistic UI updates and improved UX
- Demonstrates modern data fetching patterns

[View Example →](./react-query/README.md)

---

### [Node.js CLI](./node-cli)

A command-line tool for executing swaps without a web interface.

**Key Features:**

- Custom signer implementation using algosdk
- Environment variable configuration
- Detailed console output and progress tracking
- No browser or wallet provider required
- Can be used for backend, automation and scripting

[View Example →](./node-cli/README.md)

---

## Getting Started

All examples use the local SDK package via pnpm workspaces. This means changes to the SDK are immediately reflected in the examples.

### Prerequisites

- **Haystack Router API Key** - Request an API key by emailing [support@txnlab.dev](mailto:support@txnlab.dev)
- algosdk 3.0.0 or later (peer dependency)
- Node.js >= 20
- pnpm 10.20.0 or later

### Installation

From the repository root:

```bash
pnpm install
```

This installs dependencies for all packages and examples.

### Running Examples

Build the SDK first:

```bash
pnpm build
```

Then run any example:

```bash
# React
cd examples/react
pnpm dev

# React Query
cd examples/react-query
pnpm dev

# Node.js CLI
cd examples/node-cli
pnpm dev
```

## Configuration

Each example requires a Haystack Router API key. Create a `.env` file in the example directory:

### React / React Query

```bash
VITE_HAYSTACK_ROUTER_API_KEY=your-api-key-here
```

### Node.js CLI

```bash
HAYSTACK_ROUTER_API_KEY=your-api-key-here
ACCOUNT_MNEMONIC="your 25 word mnemonic phrase"
```

## Development Workflow

The monorepo structure enables a smooth development workflow:

1. **Make SDK changes** in `packages/haystack/src/`
2. **Rebuild the SDK**: `pnpm build` (from root)
3. **Test immediately** in any example (changes are reflected automatically)

## Support

- [GitHub Issues](https://github.com/TxnLab/haystack-js/issues)
- [Discord](https://discord.gg/Ek3dNyzG)
- [Documentation](https://txnlab.gitbook.io/deflex-api)
