# Nofida Internal Library Metadata

Design libraries and templates for the Nofida platform. Sourced from [Penpot Hub](https://penpot.app/penpothub/libraries-templates) and the [penpot/penpot-files](https://github.com/penpot/penpot-files) repository.

This directory now serves two roles:

- repo-tracked source metadata for the sync job
- local-dev fallback content when `NOFIDA_LIBRARY_STORE_ROOT` is not set

In production, the frontend bind-mounts the host-backed store:

```text
/opt/nofida-core/library-store
```

That store is exposed under the app origin at:

```text
https://engine.sys.bachopus.com/nofida/libraries/
```

## Files In This Directory

| File | Purpose |
|---|---|
| `penpot-hub.inventory.json` | Full upstream inventory source used by the monthly sync job. |
| `catalog.json` | Repo-local fallback catalog for local dev and image-only runs. |
| `catalog.example.json` | Minimal schema example for a vendored entry. |
| `download-plan.md` | Earlier curation notes and download research. |
| `files/` | Local-dev fallback vendored files directory. |
| `quarantine/` | Local-dev fallback quarantine directory. |
| `logs/` | Local-dev fallback log directory. |

## Production Sync

The server-side sync entrypoint is:

```bash
bash scripts/sync-penpot-hub-libraries.sh
```

By default it reads:

```text
branding/libraries/penpot-hub.inventory.json
```

And writes:

```text
/opt/nofida-core/library-store/
```

Publicly exposed:

- `/nofida/libraries/catalog.json`
- `/nofida/libraries/files/<id>.penpot`

Not publicly exposed:

- `/nofida/libraries/inventory.json`
- `/nofida/libraries/quarantine/`
- `/nofida/libraries/logs/`

## Manual Inbox

The manual inbox is an internal fallback / maintenance path for operator-supplied recovery files. It is not the primary Hub integration strategy.

The inbox lives beside the host store:

```text
/opt/nofida-core/library-store/manual-inbox/
```

Expected subdirectories:

- `processed/`
- `rejected/`
- `logs/`

Manual ingestion entrypoint:

```bash
bash scripts/ingest-manual-penpot-files.sh
```

Optional internal add-flow verification for newly staged modern files:

```bash
bash scripts/ingest-manual-penpot-files.sh --verify-imports
```

Or run the verification pass directly:

```bash
node scripts/verify-014m.mjs --store-root /opt/nofida-core/library-store
```

## License Review Policy

Before moving any Hub file into the approved vendored store:

1. Check for a `.LICENSE` companion in `https://github.com/penpot/penpot-files`
2. If absent, use the Penpot default only when provenance is still clear
3. For icon sets, verify the upstream icon repository license
4. Route MPL/GPL/copyleft cases to review
5. Route trademark-bearing content to `legal_review`

## Bootstrap / Verification

Dry run:

```bash
bash scripts/sync-penpot-hub-libraries.sh --dry-run
```

Metadata only:

```bash
bash scripts/sync-penpot-hub-libraries.sh --skip-downloads
```

Sample approved downloads:

```bash
bash scripts/sync-penpot-hub-libraries.sh \
  --id penpot-design-system \
  --id heroicons \
  --id wireframes-kit \
  --limit 3
```

## Importing Into Penpot

Current NOFIDA Hub behavior is split by file format:

1. Modern `.penpot` archives can be added from the in-app `Библиотеки NOFIDA` flow.
2. Legacy binary Penpot files are still hostable, but they surface as `Требуется конвертация` until they are migrated to the modern archive format.
3. Larger modern archives that fit the verified host-side import window can still be vendored and added from the same-origin hub flow.
4. Manually supplied modern files can carry `open_default_page` so `Открыть` avoids a broken `Cover` page when a better page exists, once the file is explicitly approved for use.
5. Operator-supplied manual uploads should default to `license_status: needs_review` until explicitly approved.

Maintenance notes and follow-up options remain in [docs/penpot-library-import-options.md](/c:/Nofida/docs/penpot-library-import-options.md:1).
