# NOFIDA

NOFIDA is a **branded, self-hosted distribution of [Penpot](https://penpot.app)** — a
corporate design environment served as a single, independent application.

There is **no iframe and no Vercel wrapper**. The Penpot frontend is rebranded as
Nofida (logo, colours, favicon, title) via a thin Docker override layer and served
directly on one domain, so login/session cookies are first-party and "just work".

## Architecture

```
Browser ──HTTPS──> Caddy (TLS) ──> penpot-frontend (branded)  :9001
                                      ├─ /api, /ws  ──> penpot-backend
                                      ├─ rendering  ──> penpot-exporter
                                      ├─ Postgres (penpot-postgres)
                                      └─ Valkey   (penpot-valkey)
```

Everything is one origin (`https://app.sys.bachopus.com` in production). Pinned to
Penpot **2.16.0**.

## Repository layout

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | Self-contained, version-pinned Penpot stack; builds the branded frontend. |
| `branding/Dockerfile` | Override layer `FROM penpotapp/frontend` — injects brand + AI Core. |
| `branding/brand/` | `nofida-brand.css` (theme/logo overrides), `logo.svg`, `favicon.svg`. |
| `branding/ai-core/` | Injected AI overlay (`nofida-ai-core.js`), transport bridge (`ai-bridge.js`). |
| `branding/ai-core/plugin/` | Companion Penpot plugin scaffold (creates layers via the Penpot API). |
| `scripts/setup-cloud-core.sh` | Provisions a fresh Ubuntu box: Docker + Caddy + the stack. |

## Local run

```bash
docker compose up -d --build
```

Open <http://localhost:9001>, register an account, and you're in the branded editor.

```bash
docker compose down          # stop
docker compose logs -f penpot-frontend
```

## Production deploy (Hetzner)

Prerequisite: an A record `app.sys.bachopus.com → <server IP>` must resolve.

```bash
# on the server, from a checkout of this repo:
bash scripts/setup-cloud-core.sh
```

The script installs Docker + Caddy, generates a persistent `PENPOT_SECRET_KEY`
into `.env`, builds/starts the branded stack, and configures Caddy for automatic
TLS on `app.sys.bachopus.com` (with an optional 301 redirect from the retired
`engine.sys.bachopus.com`). No iframe headers are set.

## Branding

Brand assets are layered on top of unmodified Penpot files (no source fork), so
Penpot upgrades are a one-line version bump in `docker-compose.yml` /
`branding/Dockerfile`. **After bumping the version, re-verify** the served asset
paths and the theme CSS-variable / logo selectors against the new build — see the
notes at the top of `branding/brand/nofida-brand.css`.

## AI Core (scaffold)

The override layer injects a floating **Nofida AI** assistant (Shadow-DOM isolated)
over the canvas. Layer generation is designed to run through Penpot's Plugin API:

- `branding/ai-core/nofida-ai-core.js` — the floating button + panel UI.
- `branding/ai-core/ai-bridge.js` — swappable transport (`stub` in v1; `plugin`
  target; `rpc` fallback).
- `branding/ai-core/plugin/` — companion plugin whose sandboxed `code.js` is the
  only place the `penpot` API is called. Requires `enable-plugins` (set in the
  compose `PENPOT_FLAGS`).

v1 ships the UI shell + wiring; the live model calls and real layout generation
are added on top of this scaffold.

## Licensing

Penpot is MPL-2.0. Self-hosting and rebranding for internal use is permitted. This
distribution adds Nofida assets alongside unmodified Penpot files and does not
represent Nofida as endorsed by or affiliated with Penpot.
