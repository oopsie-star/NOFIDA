# NOFIDA Font Store

This directory is the host-backed target for PATCH 018B font ingestion.

Expected runtime structure:

- `catalog.json`
- `files/`
- `licenses/`
- `logs/`

Do not commit downloaded font binaries into git. Populate this store with:

```bash
node scripts/sync-open-fonts.mjs --target ./font-store
```
