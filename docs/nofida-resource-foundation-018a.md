# NOFIDA Resource Foundation 018A

PATCH 018A establishes the first safe resource foundation for fonts, media, and
Figma migration without enabling direct canvas mutation, direct database writes,
or external asset hotlinking.

## 1. Font Hub audit

Official Penpot docs confirm:

- Penpot includes the Google Fonts catalog by default.
- Custom fonts are uploaded from the dashboard Fonts section.
- Custom fonts are available across the files of a team.
- Supported upload formats are `TTF`, `OTF`, `WOFF`, and `WOFF2`.
- Viewers can use custom fonts in files but cannot manage them from the dashboard.

Official sources used:

- https://help.penpot.app/user-guide/designing/text-typo/
- https://help.penpot.app/technical-guide/configuration/

### Scope findings

- Supported and documented now: default Google Fonts catalog plus team-scoped custom uploads.
- Not documented as a normal end-user flow: per-user private custom font catalogs.
- Not documented as a normal operational flow: server-global custom font installation exposed through the dashboard.

### Storage and serving findings

Penpot's user documentation describes custom fonts as team uploads. Penpot's technical configuration docs describe uploaded objects/assets as living in the configured object storage backend:

- `fs` backend by default at `/opt/data/objects`
- or `s3` for external object storage

Inference:

- custom-font binaries should be treated as object-storage managed uploads, not as records to write directly into Postgres by hand
- serving behavior is tied to normal Penpot object delivery, not to static frontend asset folders managed by NOFIDA

Because global install behavior is not clearly documented as a stable supported workflow, this patch ships:

- a curated catalog UI
- license metadata
- pairing guidance
- a documented install path that points operators to the supported team upload flow first

## 2. Media Bank foundation

This patch creates a server-side media store contract with repo fallback content:

- canonical production path: `/opt/nofida-core/media-store/`
- public same-origin path: `/nofida/media-store/`
- structure:
  - `catalog.json`
  - `files/`
  - `thumbnails/`
  - `licenses/`

The shipped assets are tiny placeholder SVGs authored for this repo and released
as `CC0-1.0`, so the Media Bank can function without adding copyrighted or large
binary media into git.

## 3. Media Context Packer boundary

Future AI flows should not receive the entire media catalog by default.

This patch adds:

- `services/nofida-hub-adapter/ai/media-context-packer.mjs`

Boundary behavior:

- load the media catalog from disk
- score by task type, prompt text, category, style, mood, audience, tags, and use cases
- return only the most relevant subset within a bounded payload

## 4. Figma migration audit

Official Penpot import docs confirm:

- Penpot imports `.penpot` files
- Penpot also imports `.zip` Penpot files
- Penpot's import size limit is documented as 1GB
- exported Penpot files are ZIP-based packages with assets plus readable JSON

Official source used:

- https://help.penpot.app/user-guide/export-import/export-import-files/

Official Penpot export docs confirm common asset export targets:

- `PNG`
- `JPEG`
- `WEBP`
- `SVG`
- `PDF`

Official source used:

- https://help.penpot.app/user-guide/export-import/exporting-layers/

Local NOFIDA findings:

- the existing NOFIDA Hub adapter already drives Penpot's native import flow server-side
- the current adapter relies on authenticated Penpot endpoints rather than direct DB writes
- the import path is implemented in `services/nofida-hub-adapter/server.mjs`

### Feasibility tiers

Easy:

- SVG, PNG, PDF, and raster asset migration
- exporting Figma assets and reusing them in Penpot/NOFIDA files

Medium:

- design tokens JSON normalization
- font replacement reporting against Font Hub
- asset extraction and catalog staging into the Media Bank

Hard:

- full Figma node-tree conversion into native Penpot layers
- component/variant fidelity
- autolayout to Penpot layout behavior mapping

Very hard:

- exact prototype interactions
- plugin-specific metadata
- reliable 1:1 parity claims across all files

### Recommended future importer architecture

1. Figma source reader
2. Asset exporter
3. Token mapper
4. Font mapper
5. Component mapper
6. NOFIDA Hub matcher
7. Migration report generator
8. Optional Penpot file generator or import adapter

This patch intentionally ships only the entry surface and the strategy, not a
live parser or a 1:1 import promise.
