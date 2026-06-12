# Penpot Hub Library Download Plan

## Inventory Summary

| Metric | Count |
|---|---|
| Total Hub entries scraped | 115 |
| Entries with confirmed download URL | ~40 |
| Entries license-clear (MIT / Apache-2.0 / CC BY 4.0) | ~95 |
| Entries blocked (trademark, too large, unknown license) | ~20 |
| Entries curated into catalog.json | 31 |

Full inventory: `penpot-hub.inventory.json`

---

## File Size Tiers

| Tier | Size | Strategy |
|---|---|---|
| Small | < 5 MB | Safe to commit to Git LFS or `branding/libraries/files/` |
| Medium | 5–15 MB | Use Git LFS; avoid bare Git |
| Large | 15–100 MB | Do NOT commit; store in object storage (S3/R2) or on server |
| Very large | > 100 MB | Skip entirely |

Files tracked in `branding/libraries/files/` must stay under 5 MB each or use Git LFS. Nothing is committed here yet — this sprint is catalog-only.

---

## Phase 1 — First 10 to vendor (small, license-clear, high-value)

Download from `https://penpot.github.io/penpot-files/<filename>.penpot` unless otherwise noted.

| # | id | Filename | License | Size estimate |
|---|---|---|---|---|
| 1 | wireframes-kit | `Wireframing kit v1.1.penpot` | CC BY 4.0 | ~2 MB |
| 2 | penpot-design-system | `Pencil-Penpot-Design-System.penpot` | CC BY 4.0 | ~3 MB |
| 3 | empathy-maps | `Empathy Maps.penpot` | CC BY 4.0 | small |
| 4 | ux-notes | `UX Notes.penpot` | CC BY 4.0 | small |
| 5 | lean-ux-canvas | `Lean UX Canvas.penpot` | CC BY 4.0 | small |
| 6 | heroicons | `Heroicons.penpot` | MIT | ~1 MB |
| 7 | bootstrap-icons | `Bootstrap Icons.penpot` | MIT | ~2 MB |
| 8 | fontawesome-icons | `FontAwesome.penpot` | CC BY 4.0 | ~3 MB |
| 9 | 100-card-design-templates-ui-kit | `100 Card Design.penpot` | CC BY 4.0 | 2.6 MB |
| 10 | ajeen-icons | `Ajeen Icons.penpot` | CC BY 4.0 | 3.5 MB |

---

## Download Commands (when ready)

Run from repo root. Files go into `branding/libraries/files/`. Do NOT run until Git LFS is configured if files exceed 5 MB.

```bash
BASE="https://penpot.github.io/penpot-files"
DEST="branding/libraries/files"
mkdir -p "$DEST"

curl -L -o "$DEST/wireframing-kit-v1.1.penpot"           "$BASE/Wireframing%20kit%20v1.1.penpot"
curl -L -o "$DEST/pencil-penpot-design-system.penpot"    "$BASE/Pencil-Penpot-Design-System.penpot"
curl -L -o "$DEST/empathy-maps.penpot"                   "$BASE/Empathy%20Maps.penpot"
curl -L -o "$DEST/ux-notes.penpot"                       "$BASE/UX%20Notes.penpot"
curl -L -o "$DEST/lean-ux-canvas.penpot"                 "$BASE/Lean%20UX%20Canvas.penpot"
curl -L -o "$DEST/heroicons.penpot"                      "$BASE/Heroicons.penpot"
curl -L -o "$DEST/bootstrap-icons.penpot"                "$BASE/Bootstrap%20Icons.penpot"
curl -L -o "$DEST/fontawesome.penpot"                    "$BASE/FontAwesome.penpot"
curl -L -o "$DEST/100-card-design.penpot"                "$BASE/100%20Card%20Design.penpot"
curl -L -o "$DEST/ajeen-icons.penpot"                    "$BASE/Ajeen%20Icons.penpot"
```

After downloading, verify sizes and update `catalog.json` entries:
- Set `"file": "files/<filename>.penpot"`
- Set `"status": "vendored"`

---

## Large Files — Object Storage Plan

Files > 15 MB should be hosted outside Git. Suggested path: `s3://nofida-assets/penpot-libraries/<filename>.penpot` or equivalent R2 bucket. Update `catalog.json` with `"internal_url": "https://assets.nofida.io/penpot-libraries/<filename>.penpot"` when available.

Large files in inventory (skip for now):
- Android UI Kit — 82 MB
- Ant Design System — 59 MB
- 50 Mobile Bottom Navigation Bar — 33 MB
- Android & iOS Keyboards Kit — 35.7 MB
- Google Maps UI Kit — size unknown, trademark risk

---

## Preseed into Penpot (Future Spike)

Penpot does not expose a public REST endpoint for importing `.penpot` files as shared libraries programmatically. Options to investigate:

1. **Manual import via UI**: File → Import → select `.penpot` → share as library within the team. Simplest; no code.
2. **Penpot API (internal)**: Undocumented endpoints in `penpot-backend`. Research `POST /api/rpc/command/import-file`. Requires auth token and team-id — feasible but not officially supported.
3. **Pre-seed via DB restore**: Export a project containing all vendored libraries from one instance; restore into new instances at setup time. Most reliable for fleet deploys.

This sprint does not include preseed. The `import_mode` field in `catalog.json` documents intent per library (`manual-from-hub`, `preseed-pending`).

---

## Blocked Entries (Do Not Vendor)

| Entry | Reason |
|---|---|
| Company logos | Trademark — requires per-brand permission |
| Google Maps UI Kit | Trademark |
| Android UI Kit (82 MB) | Size |
| Ant Design System (59 MB) | Size |
| Android & iOS Keyboards (35.7 MB) | Size |
| 50 Mobile Bottom Nav (33 MB) | Size |
| Circum Icons | MPL-2.0 copyleft — safe to use in designs but not redistribute modified files |
