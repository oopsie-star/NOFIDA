# PATCH 019A — NOFIDA Navigation Architecture

## Purpose

PATCH 019A introduces a shared navigation contract for NOFIDA so dashboard/resource, account, and editor routes stop behaving like unrelated mini-apps.

Implementation anchor:

- `branding/ai-core/nofida-navigation.js`

## Surface Definitions

### Dashboard Surface

Owns project browsing and resource discovery.

Canonical routes:

- `#/dashboard`
- `#/dashboard/team/:teamId/projects`
- `#/dashboard/fonts?team-id=:teamId`
- `#/dashboard/team/:teamId/fonts`
- `#/nofida/libraries`
- `#/nofida/media`
- `#/nofida/import/figma`
- `#/nofida/help`
- `#/nofida/learn`
- `#/nofida/repository`
- `#/nofida/community`
- `#/nofida/releases`
- `#/nofida/changelog`
- `#/nofida/terms`
- `#/nofida/privacy`
- `#/nofida/open-source-notices`

### Account Surface

Owns account settings and NOFIDA AI configuration.

Canonical routes:

- `#/settings/options`
- `#/settings/options?nofida=ai&tab=api`
- `#/settings/options?nofida=ai&tab=models`
- `#/settings/options?nofida=ai&tab=accounts`
- `#/settings/options?nofida=ai&tab=engine`
- `#/settings/options?nofida=ai&tab=prompts`

### Editor Surface

Owns active file editing and file-local AI actions.

Canonical routes:

- `#/workspace?...`
- `#/viewer?...`
- `#/inspect?...`

## Route Map

### Shared Resource Menu

This menu is the stable NOFIDA resource group for dashboard/resource flows.

- `Проекты`
- `Библиотеки`
- `Шрифты`
- `Медиа`
- `Импорт из Figma`
- `Справка`
- `Обучение`

### Menu Placement

- Dashboard sidebar: shared `Ресурсы` group injected by `nofida-navigation.js`
- Resource shells (`libraries`, `media`, `figma`, internal pages): same menu rendered in the left panel
- Account settings: native account sidebar plus `NOFIDA AI`
- Editor: no dashboard resource sidebar; editor tools stay contextual

## Allowed Transitions

- Dashboard -> resource routes stays on Dashboard Surface
- Dashboard -> account settings is explicit
- Dashboard resource pages -> editor is explicit via `Открыть в редакторе`
- Editor -> resource center is explicit via `Открыть ресурсный центр`
- Editor resource center -> editor returns via `Назад в редактор`
- Account settings -> NOFIDA AI stays inside account settings

## Forbidden Transitions

- Resource pages auto-opening the editor without an explicit user action
- Account settings rendering the dashboard resource menu
- Editor AI or resource previews kicking the user to dashboard implicitly
- Independent sidebar injectors adding competing NOFIDA resource menus
- Generic close actions with unclear destination on NOFIDA resource/account pages

## Back Behavior

- Resource route opened from dashboard returns to the last non-resource dashboard route, usually projects
- Resource route opened from editor returns to the stored editor hash
- NOFIDA AI account page returns to `#/settings/options`
- Native fonts route remains a dashboard route and returns to dashboard projects

The contract is stored in session-level navigation state so resource-to-resource hops preserve the original safe back target.

## Technical Contract

Primary helpers exposed by `window.NofidaNavigation`:

- `getCurrentSurface()`
- `isDashboardSurface(hash)`
- `isAccountSurface(hash)`
- `isEditorSurface(hash)`
- `isResourceRoute(hash)`
- `getSafeBackTarget(currentHash, previousHash)`
- `goToNofidaRoute(route, options)`
- `getRouteMeta(hash)`
- `getResourceMenuItems(hash)`

## Known Limitations

- `#/nofida/*` routes are still same-origin branded shells because the base Penpot router does not natively own those routes.
- Native Fonts remains the source of truth for installed fonts; the NOFIDA font catalog is advisory and discovery-first.
- The native Fonts surface can canonicalize hash state during Penpot SPA updates, so active resource state also uses live DOM detection for the Fonts screen.
- Editor return targets rely on session navigation state, not a backend route registry.
- Existing Hub import, media/font ingestion, and AI provider logic are intentionally unchanged by this patch.
