# PATCH 026A.8 — Developer Handoff + User Workflow + Acceptance + Deploy

Role: Senior product engineer (final integration of PATCH 026A).

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0–026A.7 (the full autonomous
  designer pipeline works end-to-end behind disabled flags).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads; `ALLOW_BULK_UPDATE=false`.
2. Handoff generation is **pure code** over session artifacts — the `designer_handoff_generator`
   LLM task is used only for interaction/accessibility prose notes, not for values.
3. The user is never exposed to Transit, UUIDs, raw Scene Model, compiler diagnostics (unless
   error), or Penpot internal schema.
4. Disposable test files only; production flags stay off until live verification passes.
5. Finish with: full verify PASS, `verify-025a` regression PASS, report in the master-spec
   "Final report" format, commit(s), tag, deploy.

## Key files

`services/nofida-hub-adapter/ai/designer/*` (session artifacts), `ai/prompt-registry.mjs`,
`branding/ai-core/nofida-ai-core.js` (panel; screenSpec card ~line 2119–2126, apply
~line 1955), `branding/ai-core/ai-bridge.js`, `scripts/verify-026a-autonomous-designer.mjs`.

Deploy reality: the server has no git — deploy is scp of changed files + docker rebuild
`--no-cache` for the frontend container.

## Task 1: Handoff Generator

Create `services/nofida-hub-adapter/ai/designer/handoff-generator.mjs`. From the session's
`DesignSystemManifest`, component definitions, resolved boards and layout metadata generate:

* **`nofida-design-system.json`** — primitive tokens, semantic tokens, light/dark values,
  typography styles, spacing scale, radii, shadows, component definitions;
* **CSS variables** — `:root { --color-background-canvas: …; --space-4: …; --radius-card: …; }`
  plus `[data-theme="dark"] { … }` overriding semantic values;
* **component handoff** — per component: name, purpose, props, variants, states, dimensions,
  spacing, token bindings, interaction notes, accessibility notes;
* **screen specification** — per screen: frame size, sections, component tree, responsive
  behavior (from layout metadata), content rules, navigation actions, theme variants.

Downloadable from the panel as a bundle; gated behind `nofida_ai_handoff_v1`.

## Task 2: User-facing workflow

Extend `nofida-ai-core.js` (visible only when `nofida_ai_autonomous_designer_v1` is on):

1. user enters a normal product request;
2. AI shows a concise interpretation card: product, target platform, planned screens, visual
   direction — with **Approve** and **Generate now** actions;
3. progress stages surfaced in plain language (design system → screens → visual QA → done);
4. result: editable boards on canvas + design system summary + components + handoff download;
5. errors surfaced in plain language; compiler diagnostics only on failure; internal artifacts
   never rendered.

## Task 3: Acceptance fixtures

**Fixture 1 (product brief only)** — run the full pipeline live on a disposable file from
exactly this request, with no reference image, colors, coordinates, font sizes, token values,
component list or card structure provided:

`Создай главный экран мобильного приложения для отслеживания женского цикла. Нужны светлая и тёмная версии, прогноз следующей менструации, недельный календарь, сводка цикла и подробный календарь месяца.`

Expected: two editable boards (light/dark) containing status/header zone, date, weekly
calendar, forecast card, primary action, pregnancy/chance status, section switcher, cycle
phase timeline, summary metrics, monthly calendar; coherent paired themes; premium wellness
aesthetic; editable abstract vector background; repeated patterns as components; no
admin-dashboard/hospital look, no random gradients. Technical: top-level boards, frame depth
≤ 3, zero dropped nodes, stable IDs, token coverage thresholds, light/dark parity, critic
score ≥ 85, survives reload, idempotent retry, rollback works.

**Fixture 2 (developer handoff)** — from the same session verify a developer receives the full
bundle (design-system JSON, CSS variables, component inventory with variants/states, screen
component tree, interaction + accessibility notes) and can implement without guessing colors,
text styles, spacing, radii, component states, theme mapping or responsive rules.

## Task 4: Final verification, report, deploy

* complete `scripts/verify-026a-autonomous-designer.mjs` so it runs all sections 026A.0–026A.8
  and prints the master-spec "Final report" block (all PASS/FAIL lines: autonomous designer
  modules, acceptance fixture, design system coverage percentages, visual QA scores/passes,
  handoff, scene/compiler counters, repo/deploy, safety, recommendation);
* commit(s) with clean worktree, tag `nofida-stable-026A-autonomous-designer`, push;
* deploy: scp changed server files, rebuild frontend container `--no-cache`; run the live
  acceptance on production against a **disposable** file;
* flags remain **disabled in production**; the report ends with an explicit recommendation:
  enable / fix required / keep disabled.

## Final report

Use the master PATCH 026A "Final report" format verbatim (module PASS/FAIL list, acceptance
fixture results, design-system coverage numbers, visual QA scores, handoff checks,
scene/compiler counters incl. "raw Penpot schema emitted by LLM: NO", "Bulk Update used: NO",
repo/deploy status with commit hash, safety confirmations, recommendation).
