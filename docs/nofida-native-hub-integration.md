# NOFIDA Native Penpot Hub Integration Audit

## Scope

PATCH 015A audits why Penpot Cloud can expose and import Penpot Hub libraries/templates, while the current NOFIDA self-hosted flow cannot do that reliably with the existing overlay.

This document treats PATCH 014M as fallback/internal recovery tooling only. It is not the product architecture.

## Executive Summary

The main failure is not Penpot's backend importer itself. The main failure is that NOFIDA currently tries to turn the public Penpot Hub into an in-app product by patching the DOM, relying on a static catalog, and posting blobs directly to `/api/rpc/command/import-binfile` without the native Penpot import analysis/version-selection step.

Penpot 2.16.0 already supports both:

- old binary v1 imports through `bf.v1/import-files!`
- modern ZIP/v3 imports through `bf.v3/import-files!`

The old Hub files fail in NOFIDA because the overlay bypasses native detection and falls into the default v3 ZIP path. That produces `zip END header not found`.

Separately, self-hosted Penpot does not ship a native public Penpot Hub module in the dashboard. Native self-hosted modules cover:

- team shared libraries
- builtin templates
- external links out to `penpot.app/penpothub`

So Cloud parity cannot be achieved by continuing to expand the overlay. It needs a proper backend Hub service plus native frontend integration that reuses Penpot's real import flow.

## Current Versions

Source: local compose stack in `docker-compose.yml`.

- frontend image: `nofida/frontend:2.16.0`
- backend image: `penpotapp/backend:2.16.0`
- exporter image: `penpotapp/exporter:2.16.0`
- MCP image: `penpotapp/mcp:2.16.0`
- version mismatch: no

As of 2026-06-15, Penpot's latest stable GitHub release is also `2.16.0`, so there is no newer stable release to test as an upgrade escape hatch.

## Current Overlay / Hack Inventory

Current product-facing Hub behavior is driven by `branding/ai-core/nofida-library-hub.js`, not by native Penpot modules.

Inventory:

- injects a custom `#/nofida/libraries` overlay route
- injects a custom sidebar item into the dashboard
- replaces native dashboard links to `penpot.app/penpothub` with overlay openers
- downloads vendored blobs and POSTs them directly to `/api/rpc/command/import-binfile`
- uses `localStorage` as a speed cache for installed-state detection
- uses `MutationObserver` to keep reinjecting UI into the SPA
- adds custom workspace hash parameters (`nhb-page-id`, `nhb-page`)
- patches broken dashboard thumbnail images with a branded fallback block

This is exactly the class of solution we should now freeze as fallback-only.

## Native Penpot Modules Found

### Native import UI

Frontend files:

- `frontend/src/app/main/ui/dashboard/import.cljs`
- `frontend/src/app/worker/import.cljs`
- `frontend/src/app/main/data/uploads.cljs`
- `frontend/src/app/main/repo.cljs`

Backend files:

- `backend/src/app/rpc/commands/binfile.clj`
- `backend/src/app/binfile/v1.clj`
- `backend/src/app/binfile/v3.clj`
- `backend/src/app/binfile/common.clj`

### Native dashboard gallery / libraries / templates

Frontend files:

- `frontend/src/app/main/ui/dashboard/libraries.cljs`
- `frontend/src/app/main/ui/dashboard/templates.cljs`
- `frontend/src/app/main/data/dashboard.cljs`
- `frontend/src/app/main/ui/dashboard/sidebar.cljs`

Backend files:

- `backend/src/app/setup/templates.clj`

### Native thumbnail / media path

Frontend files:

- `frontend/src/app/worker/thumbnails.cljs`
- `frontend/src/app/main/data/workspace/thumbnails.cljs`

Backend files:

- `backend/src/app/rpc/commands/files_thumbnails.clj`
- `backend/src/app/rpc/commands/media.clj`
- `backend/src/app/http/assets.clj`

## Native Import Path

### Import UI files / functions

`frontend/src/app/main/ui/dashboard/import.cljs` opens the import dialog and accepts `.penpot,.zip`.

`frontend/src/app/worker/import.cljs` performs file analysis first and classifies files as:

- `:binfile-v1`
- `:binfile-v3`
- `:legacy-zip`
- `:unknown`

### Exact endpoint used

Native UI uses `rp/cmd!` to call:

- `api/main/methods/create-upload-session`
- `api/main/methods/upload-chunk`
- `api/main/methods/import-binfile`

It does not use the current overlay shortcut to `/api/rpc/command/import-binfile`.

### Payload shape

Native import ultimately sends:

- `name`
- `project-id`
- `upload-id` or multipart `file`
- `version`

The backend schema in `backend/src/app/rpc/commands/binfile.clj` defaults `version` to `3` when omitted.

### Whether native UI uses `import-binfile`

Yes. Native UI still ends at `import-binfile`, but only after it has:

- detected the file format first
- chosen `version: 1` for old binaries or `version: 3` for ZIP/v3
- uploaded via chunked session APIs

### Deprecated / legacy file handler

The worker still recognizes `legacy-zip` files, but the important current import paths are:

- old binary v1
- modern ZIP/v3

For this Hub audit, the key split is v1 vs v3.

### ZIP handler

Modern ZIP `.penpot` files are handled by `bf.v3/import-files!` in `backend/src/app/binfile/v3.clj`.

## Native Hub / Libraries / Templates Path

### What the dashboard gallery really is

`frontend/src/app/main/ui/dashboard/libraries.cljs` is the team shared libraries page. It is not the public Penpot Hub.

`frontend/src/app/main/ui/dashboard/templates.cljs` is a builtin templates panel. It fetches builtin templates and clones them through native events.

### Where dashboard gallery content comes from

- shared libraries come from team shared files
- builtin templates come from `get-builtin-templates` / `clone-template`
- builtin template files are loaded by `backend/src/app/setup/templates.clj`

### How Penpot Cloud opens/imports Hub files

Public Hub pages on `penpot.app` expose:

- `Use in Penpot.app`
- `Download file`

The public website points `Use in Penpot.app` at `design.penpot.app`, while self-hosted dashboard source only links outward to `penpot.app/penpothub`.

### Whether self-hosted Penpot has this module disabled/missing

The public Hub module is effectively missing from self-hosted dashboard code. This is not just a flag being off in our deployment. The audited self-hosted source tree does not contain a native in-app public Hub browser/import module.

### Whether Hub files require cloud-only backend services

The files themselves do not require a cloud-only backend if you already have the valid `.penpot` blob. Proof tests show self-hosted Penpot 2.16.0 can import valid v1 and v3 files natively.

What is cloud-specific is the public Hub discovery/open-in-app UX layer:

- catalog browsing
- `Use in Penpot.app` link target
- current Hub website integration

So the import engine is usable self-hosted, but the public Hub product experience is not included self-hosted.

## Old Binary Diagnosis

### Why `010b1a865063a15f...` files fail with `zip END header not found`

That header is the old Penpot binary v1 format. Native worker detection maps it to `version: 1`.

The current overlay does not do that. It POSTs the blob directly to `/api/rpc/command/import-binfile` with no `version`, so backend defaulting kicks in:

- omitted `version` => backend defaults to `3`
- v3 handler expects a ZIP container
- old binary v1 file is not a ZIP
- result: `zip END header not found`

### Should current Penpot import them?

Yes. Penpot 2.16.0 should import them through `bf.v1/import-files!`. Proof tests confirmed that.

### Does newer Penpot import them?

There is no newer stable release than `2.16.0` available as of 2026-06-15. The current `develop` branch still contains:

- v1 detection in `frontend/src/app/worker/import.cljs`
- `bf.v1/import-files!` dispatch in `backend/src/app/rpc/commands/binfile.clj`

So there is no sign that a newer version is required for this specific problem.

### Does a converter / migration path exist?

Yes.

The existing migration path is:

- `bf.v1/import-files!`
- `app.binfile.migrations`
- optional re-export to v3 if we want normalized cache/output later

So the converter path already exists inside Penpot. NOFIDA simply is not using it correctly today.

## Assets / Thumbnails Diagnosis

### Distinguish two thumbnail systems

The audit found two separate things:

1. file media / frame thumbnails inside imported content
2. dashboard file-card thumbnail previews

These are not the same storage path.

### File media / frame thumbnail migration

For both v1 and v3 imports, native importer remaps storage/media IDs and persists:

- `file_media_object`
- `file_tagged_object_thumbnail`

This is handled in `backend/src/app/binfile/v1.clj` and `backend/src/app/binfile/v3.clj`.

Fresh proof imports showed no asset 404s from imported file media during audit checks, which supports that native media remapping works.

### Why dashboard thumbnails break

Dashboard previews use the separate `file_thumbnail` path.

The importers do not create a fresh `file_thumbnail` on import.

What happens instead:

- `app.binfile.common/file-attrs` copies all file attrs, including optional `thumbnail-id`
- if an exported file carries a top-level `thumbnail-id`, that value can be persisted on import
- but the matching `file_thumbnail` storage object is not imported or regenerated during import
- if no top-level `thumbnail-id` exists, the imported file simply has no dashboard thumbnail

This explains both observed behaviors:

- older proof from PATCH 014K: stale `thumbnail-id` values could 404 at `/assets/by-id/*`
- fresh PATCH 015A proof imports: `thumbnailId` stayed `null`, so previews were missing instead of 404ing

Same root cause:

- native import moves content/media
- native import does not regenerate dashboard file thumbnails during import

### Whether native import should migrate storage/media objects

Yes, and it already does for content media and object thumbnails.

No, it does not currently do that for top-level dashboard `file_thumbnail` objects.

### How thumbnails are generated

Audited flow:

- frontend worker asks `get-file-data-for-thumbnail`
- frontend thumbnail worker renders thumbnail data client-side
- backend persists thumbnail through `create-file-thumbnail` / `create-file-object-thumbnail`

So dashboard/file thumbnails are a render-and-upload flow, not part of binfile import itself.

## Proof Tests

Method:

- native path used Penpot's real `api/main/methods/create-upload-session` + `upload-chunk` + `import-binfile` flow with the same version selection as `frontend/src/app/worker/import.cljs`
- overlay path used current NOFIDA behavior: direct POST to `/api/rpc/command/import-binfile` with no explicit version
- isolated test projects were created under the live test account and deleted after each run
- content verdict is based on successful import plus non-empty native file summary; direct headless workspace deep-linking inside the current branded shell was not a stable enough signal to use as the primary pass/fail check

### Results

| Item | Format detected | Native import | Overlay/import-binfile | Content accessible after import | Thumbnails/assets correct |
|---|---|---|---|---|---|
| Tailwind kit | old binary v1 | PASS | FAIL (`500 zip END header not found`) | YES | NO |
| Material Design 3 | ZIP / v3 | PASS | PASS | YES | NO |
| Lucide Icons | old binary v1 | PASS | FAIL (`500 zip END header not found`) | YES | NO |

### Notes per proof case

#### Tailwind kit

- detected format: old binary v1
- native result: imported successfully with `version: 1`
- overlay result: failed with `zip END header not found`
- imported content: non-empty (`components: 12`)
- thumbnail/media result: no dashboard thumbnail generated; no fresh media 404s observed

#### Material Design 3

- detected format: modern ZIP / v3
- native result: imported successfully
- overlay result: imported successfully
- imported content: non-empty (`components: 382`)
- thumbnail/media result: no dashboard thumbnail generated; no fresh media 404s observed

#### Lucide Icons

- detected format: old binary v1
- native result: imported successfully with `version: 1`
- overlay result: failed with `zip END header not found`
- imported content: non-empty (`components: 1420`)
- thumbnail/media result: no dashboard thumbnail generated; no fresh media 404s observed

## Root Cause

### Why Penpot Cloud works but NOFIDA flow fails

Penpot Cloud has the public Hub website and `Use in Penpot.app` integration layer.

NOFIDA does not have that native module in self-hosted Penpot, so it tried to emulate the product with:

- DOM patching
- static catalog files
- stale public download URLs
- direct blob POSTs

That shortcut bypassed Penpot's native file analysis/versioning and broke old-binary imports.

### Why old binary files fail

NOFIDA overlay sends old v1 files to `import-binfile` without `version: 1`.

Backend defaults to `version: 3`, treats them as ZIP, and fails with `zip END header not found`.

### Why previews break

Imported content media is migrated, but dashboard file thumbnails are not regenerated during import.

So imported files end up with either:

- stale `thumbnail-id` values that can 404
- or no dashboard `thumbnail-id` at all

Either way, the dashboard preview path is incomplete after import.

## Whether Penpot Upgrade Is Required

No immediate Penpot upgrade is required to solve the old-binary import mismatch.

Reasons:

- current stack is already on latest stable `2.16.0`
- proof tests show self-hosted 2.16.0 can import old v1 and modern v3 files when using the native versioned path
- the main problem is architecture and integration, not missing upstream importer support

Upgrade may still be reasonable later for unrelated Penpot improvements, but it is not the fix for this Hub mismatch.

## Recommended Final Architecture

### Chosen option: D. hybrid

Meaning:

- native frontend integration
- plus a NOFIDA backend Hub service
- reusing Penpot's real import pipeline instead of the overlay shortcut

### Why not A only

Frontend-only integration is not enough because self-hosted Penpot does not ship a native public Hub backend/catalog module.

### Why not B only

Backend-only service still leaves users without a clean in-app experience.

### Why not C

Upgrade-first does not address the actual mismatch.

### Hybrid target

1. Backend Hub service

- authoritative catalog sync from Penpot Hub / `penpot-files`
- current filename resolution
- license/status gating
- format detection
- optional staging conversion/re-export to v3 for cache normalization

2. Native frontend integration

- integrate into a real frontend module or clean NOFIDA route built into the frontend image
- trigger the exact native import flow
- no `MutationObserver`
- no `localStorage` as source of truth
- no DOM replacement of Penpot public links as the main product path

3. Thumbnail completion

- after successful import, clear stale file `thumbnail-id`
- enqueue real dashboard thumbnail generation

## Phased Implementation Plan

### Phase 1

Freeze overlay growth.

- keep PATCH 014M manual inbox as fallback only
- stop building new product UX on top of `nofida-library-hub.js`

### Phase 2

Build backend catalog authority.

- resolve current Penpot Hub metadata
- fix stale public filenames
- persist format/license/import readiness
- separate public Hub inventory from manual fallback inventory

### Phase 3

Build native import adapter.

- old binary => native `version: 1`
- modern ZIP => native `version: 3`
- support chunked upload path
- optionally cache normalized v3 exports after successful staging import

### Phase 4

Build real frontend entrypoint.

- add a clean NOFIDA Hub surface in the branded frontend
- call backend Hub service
- call native import adapter
- no DOM observer reinjection

### Phase 5

Fix preview regeneration.

- clear or overwrite stale `thumbnail-id`
- trigger dashboard thumbnail generation after import
- verify no `/assets/by-id/*` preview failures remain

### Phase 6

Cut over behind a feature flag.

- pilot with a small approved subset
- compare native import success and preview generation
- retire overlay from primary UX after validation

## Rollback Plan

- keep new Hub integration behind a feature flag
- if failures appear, disable the new Hub frontend entrypoint
- keep PATCH 014M manual inbox / recovery tooling as fallback
- keep direct DB writes out of scope
- keep Caddy untouched
- revert to approved manual recovery path while preserving catalog audit data

## Decision

Proceed with PATCH 015A follow-up work as:

- backend-native Hub import adapter
- frontend architecture reset
- thumbnail regeneration fix

Do not continue expanding the current overlay as the main product solution.
