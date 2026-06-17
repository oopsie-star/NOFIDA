# NOFIDA Stable 017A Baseline

Date: 2026-06-17

## Stable now

- Internal NOFIDA product pages are live on internal routes: Help, Learn, Repository, Community, Releases, Changelog, Terms, Privacy, and Open Source Notices.
- User-facing navigation no longer sends normal product clicks to `penpot.app`.
- NOFIDA Hub opens internally at `#/nofida/libraries` and the live catalog renders 115 library cards.
- At least one library can be opened from the internal Hub into the editor workspace.
- The NOFIDA AI shell is present, the assistant FAB opens, and the NOFIDA AI account settings page renders at `#/settings/options?nofida=ai&tab=api`.
- `support@penpot.app` is no longer present in the live translation bundles checked during smoke verification.
- Live nginx now serves static help assets from `/nofida/help/`, matching the branded frontend image layout in [branding/Dockerfile](C:/Nofida/branding/Dockerfile:20).

## Draft items

- Terms and Privacy are intentionally placeholders, not final legal copy.
- Both pages must keep the notice below until legal-approved text replaces them:

```text
Draft. Replace with legal-approved text before public/commercial launch.
```

## Dirty state explained before freeze

### `branding/nginx/nofida.conf`

- Change: adds a dedicated `location ^~ /nofida/help/` block to serve static NOFIDA help pages.
- Needed: yes.
- Live-relevant: yes. The running server already includes this block, and the branded frontend image copies `help/` into `/var/www/app/nofida/help/`.
- Freeze decision: commit this file so repo state matches the live server baseline.

### Local PNG artifacts left untracked

- Files:
  - `ai-api-tab.png`
  - `ai-engine-tab.png`
  - `ai-models-tab.png`
  - `login-check.png`
  - `login-check2.png`
  - `normal-settings.png`
- Change: local screenshot artifacts used during manual verification.
- Needed: no for runtime.
- Live-relevant: no. They are not referenced by the repo or deployed app.
- Freeze decision: leave untracked and untouched. Do not silently delete or commit them into the release baseline.

## Remaining technical debt

- Terms and Privacy still require legal review before any public or commercial launch.
- Some Penpot strings still exist in non-user-visible technical/operator contexts:
  - [branding/ai-core/nofida-ai-core.js](C:/Nofida/branding/ai-core/nofida-ai-core.js:1784) keeps Penpot-domain matchers used to intercept and rewrite external links into NOFIDA internal routes.
  - [branding/libraries/penpot-hub.inventory.json](C:/Nofida/branding/libraries/penpot-hub.inventory.json:15) keeps original upstream provenance URLs for imported catalog content.
  - [branding/libraries/README.md](C:/Nofida/branding/libraries/README.md:3), [docs/nofida-native-hub-integration.md](C:/Nofida/docs/nofida-native-hub-integration.md:24), and [scripts/sync-penpot-hub-libraries.sh](C:/Nofida/scripts/sync-penpot-hub-libraries.sh:435) still mention Penpot in operator documentation and ingestion tooling.
- Live smoke also sees a non-fatal console `401` on `/api/main/methods/get-enabled-flags`. The tested dashboard, Hub, editor, AI shell, and internal pages continue to work, so this is tracked as upstream auth/feature-flag noise rather than a release blocker.
- The current AI experience is provider-backed orchestration. It is not a proprietary NOFIDA model and depends on configured external/provider APIs.
- Smoke coverage for this freeze confirms Hub `open` on a live library. A deeper end-to-end `add` import path should be rechecked in the next AI/settings patch cycle.

## Backups captured for this freeze

- Server backup root: `/opt/nofida-core/backups/017B-stable-20260617-112200`
- Included:
  - `/opt/nofida-core/branding`
  - `/opt/nofida-core/library-store`
  - `docker-compose.yml`
  - resolved `docker compose config`
  - Postgres `pg_dump`

## Next recommended patch

- `016C`: real LLM smoke via the NOFIDA AI UI settings flow, including provider save/test and an end-to-end prompted response check.
