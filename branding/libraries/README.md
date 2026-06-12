# Nofida Internal Library Catalog

Design libraries and templates for the Nofida platform. Sourced from [Penpot Hub](https://penpot.app/penpothub/libraries-templates) and the [penpot/penpot-files](https://github.com/penpot/penpot-files) repository.

After a Docker build, everything under `libraries/` is served at:
```
https://engine.sys.bachopus.com/nofida/libraries/
```

---

## Files in This Directory

| File | Purpose |
|---|---|
| `penpot-hub.inventory.json` | Full inventory of all 115 Penpot Hub entries. Source of truth for what exists upstream. |
| `catalog.json` | Curated NOFIDA internal catalog. License-reviewed entries only. |
| `catalog.example.json` | Schema reference showing a complete vendored entry. |
| `download-plan.md` | Which files to download first, exact commands, size limits, and blocked entries. |
| `files/` | Vendored `.penpot` files (empty until Phase 1 download is executed). |

---

## catalog.json Schema

```json
{
  "id": "wireframes-kit",
  "name": "Wireframes kit",
  "type": "library",
  "author": "Penpot",
  "source": "Penpot Hub",
  "hub_url": "https://penpot.app/penpothub/libraries-templates/wireframes-kit",
  "source_repo": "https://github.com/penpot/penpot-files",
  "license": "CC-BY-4.0",
  "attribution_required": true,
  "status": "ready_to_vendor",
  "file": null,
  "internal_url": null,
  "import_mode": "manual-from-hub",
  "risk_notes": "Official Penpot. CC BY 4.0. Download URL confirmed."
}
```

**`status` values**:
- `ready_to_vendor` — license confirmed, download URL confirmed; safe to add
- `needs_license_review` — download exists but license uncertain or filename unconfirmed
- `vendored` — file is in `files/` and deployed
- `skip` — trademark risk, size exceeds limits, or platform-proprietary

**`import_mode` values**:
- `manual-from-hub` — team member downloads from Hub via Penpot UI import
- `preseed-pending` — planned for automated preseed (technical spike required)
- `internal-file` — Nofida-authored file stored in `files/`

---

## License Review Policy

Before adding any file to `files/` or marking `status: ready_to_vendor`:

1. Check for a `.LICENSE` companion in `https://github.com/penpot/penpot-files`
2. If absent, default is CC BY 4.0 (confirmed via CONTRIBUTING.md)
3. For icon sets: check the upstream source repo license, not just the Hub page
4. MPL-2.0 and GPL entries require legal review before redistribution
5. Trademark-bearing content (company logos, platform UI kits) — do not vendor

CC BY 4.0 requires attribution (`attribution_required: true`). MIT/ISC/Apache-2.0 entries may be used without attribution.

---

## Adding a Library (Vendored Workflow)

See `download-plan.md` for the full plan. Short version:

```bash
# Download (example — Heroicons, MIT)
curl -L -o branding/libraries/files/heroicons.penpot \
  "https://penpot.github.io/penpot-files/Heroicons.penpot"

# Then update catalog.json:
#   "file": "files/heroicons.penpot"
#   "status": "vendored"
```

Files > 5 MB must use Git LFS or be hosted in object storage — see `download-plan.md`.

Rebuild the frontend image after adding files:
```bash
docker compose build penpot-frontend
```

---

## Importing into Penpot (Manual)

There is no automated preseed yet. Current workflow:

1. Open Nofida (engine.sys.bachopus.com)
2. File → Import → select the `.penpot` file
3. Share as a library from the file's main menu

Programmatic preseed via the Penpot internal API is tracked in `download-plan.md` as a future spike.
