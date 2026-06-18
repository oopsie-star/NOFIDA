# NOFIDA Media Store

This directory is the repo-tracked fallback for the server-side NOFIDA media bank.

Canonical production mount:

```text
/opt/nofida-core/media-store
```

Public same-origin exposure:

```text
/nofida/media-store/catalog.json
/nofida/media-store/files/*
/nofida/media-store/thumbnails/*
/nofida/media-store/licenses/*
```

This patch intentionally ships metadata and tiny placeholder SVG assets only.

The catalog is designed for two consumers:

- the internal `#/nofida/media` page
- future adapter-side media context selection for AI workflows

The full catalog should not be passed wholesale into LLM prompts. Use the
selection boundary in `services/nofida-hub-adapter/ai/media-context-packer.mjs`.
