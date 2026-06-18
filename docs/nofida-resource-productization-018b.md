# PATCH 018B — NOFIDA Resource Productization

## Scope

PATCH 018B moves the resource layer from a catalog-only foundation to a product-facing system:

- native Fonts workflow support
- host-backed `font-store`
- host-backed `media-store`
- UI pattern registry with source-model disclosure
- license-aware resource factory metadata
- AI-ready bounded resource context packers

## Font install feasibility

Technical note:

- `automatedInstall: not_supported_yet`
- `recommendedNextStep: download a reviewed font from the NOFIDA font store, then continue through the native team font upload flow`

Why this is the current recommendation:

- this patch does not write directly to the database
- this patch does not claim fonts are installed unless the native Fonts screen shows them
- native upload remains the safe product path until a supported automation path is verified

## Stores

Expected runtime paths:

- `/opt/nofida-core/font-store/`
- `/opt/nofida-core/media-store/`

Font store structure:

- `catalog.json`
- `files/`
- `licenses/`
- `logs/`

Media store structure:

- `catalog.json`
- `files/`
- `thumbnails/`
- `licenses/`
- `logs/`

## Scripts

Populate the font store:

```bash
node scripts/sync-open-fonts.mjs --target /opt/nofida-core/font-store
```

Populate the media store:

```bash
node scripts/sync-open-media.mjs --target /opt/nofida-core/media-store
```

## Resource factory rules

Every reviewed resource should keep:

- source name
- source URL
- source license
- license URL
- attribution requirement
- commercial/modification/redistribution flags
- approval status
- review notes

Only approved resources should expose product-ready actions such as install, add, or use.
