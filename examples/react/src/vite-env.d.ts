/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HAYSTACK_ROUTER_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
