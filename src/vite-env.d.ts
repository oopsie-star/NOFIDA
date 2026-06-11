/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public HTTPS origin of the self-hosted Penpot engine the canvas embeds. */
  readonly VITE_PENPOT_ENGINE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
