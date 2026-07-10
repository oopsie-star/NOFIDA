# PATCH 026A.2 — Visual Language: Art Director + Design System Generator

Role: Senior art director and design-systems engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0 (contracts, orchestrator, registry
  stubs) + 026A.1 (brief interpreter, product architect).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads. No canvas mutation here.
2. Contracts from 026A.0 (`ArtDirection`, `DesignSystemManifest`) are immutable.
3. Deterministic validation (contrast, manifest integrity) is plain code, not LLM.
4. Safety: no real user files, no DB writes, no infra changes.
5. Finish with: verify PASS, `verify-025a` regression PASS, report, one commit.

## Key files

`services/nofida-hub-adapter/ai/designer/{contracts.mjs,pipeline.mjs}`,
`ai/prompt-registry.mjs` (fill `designer_art_director`, `designer_system_generator`),
`ai/brand-kit-packer.mjs` (existing brand-token context — reuse as optional input context).

## Task 1: AI Art Director

Create `services/nofida-hub-adapter/ai/designer/art-director.mjs`.

Input: `ProductBrief` + `ProductArchitecture`. Output: `ArtDirection` contract:

```json
{
  "direction": "calm-premium-wellness",
  "keywords": [],
  "density": "comfortable",
  "contrast": "medium",
  "cornerStyle": "soft",
  "surfaceStyle": "layered-translucent",
  "imageStrategy": "abstract-vector-background",
  "themeStrategy": "paired-light-dark",
  "avoid": ["generic admin dashboard", "random gradients", "medical hospital aesthetic", "unrelated stock photos"]
}
```

Responsibilities: choose visual direction from product/audience/context; mood, density,
contrast, brand personality; flat/editorial/soft/clinical/playful/premium language;
light/dark relationship; imagery/background strategy. The prompt must demand internal
step-by-step reasoning but return only the final concise rationale (one field
`rationale`, ≤ 3 sentences) alongside the contract.

## Task 2: Design System Generator

Create `services/nofida-hub-adapter/ai/designer/design-system-generator.mjs`.

Input: `ProductBrief` + `ArtDirection`. Output: `DesignSystemManifest` contract.

Required content:

* **Colors** — primitive palette (neutral, brand, success, warning, danger, information,
  domain-specific e.g. cycle-phase colors if relevant) + semantic tokens, identical names in
  both themes: `background.canvas`, `background.surface`, `background.surfaceElevated`,
  `text.primary`, `text.secondary`, `text.muted`, `border.default`, `border.strong`,
  `action.primary`, `action.primaryText`, `state.selected`, `state.disabled`,
  `status.success`, `status.warning`, `status.danger`. Dark theme is designed, not inverted.
* **Typography** — display, page title, section title, card title, body, body compact, label,
  caption, button, numeric highlight; each with family, size, weight, line height,
  letter spacing.
* **Spacing** — one coherent scale (model's choice, e.g. 2,4,8,12,16,20,24,32,40,48),
  internally consistent.
* **Radius** — semantic: control, card, panel, modal, pill, circle.
* **Shadows/borders** — separate light/dark values.
* **Accessibility block** — declared minimum contrast targets, interactive control min-size,
  focus and disabled state rules, color-independent status indication rule.

## Task 3 (pure code, no LLM): manifest validators

In `services/nofida-hub-adapter/ai/designer/design-system-validators.mjs`:

* **Contrast checker** — WCAG 2.1 relative-luminance math; verify `text.primary` and
  `text.secondary` on `background.canvas/surface/surfaceElevated`, and `action.primaryText` on
  `action.primary`, in **both** themes; thresholds 4.5:1 body / 3:1 large text and controls.
* **Integrity checker** — every semantic token resolves to a primitive in both themes; both
  themes expose the identical semantic name set; spacing scale strictly increasing; all
  10 typography styles present and complete.
* **Not-inverted-dark heuristic** — reject a dark theme whose semantic resolutions are the
  exact channel inversion of light (compare luminance profile, allow legitimate designs).

Generator loop: invoke LLM → validate → on failure, one repair invocation with the specific
validator errors → fail structurally if still invalid.

## Verification

Append section "026A.2" to `scripts/verify-026a-autonomous-designer.mjs`:

* fixture (cycle-tracker artifacts from 026A.1) produces a contract-valid `ArtDirection` and a
  complete `DesignSystemManifest`;
* contrast checker PASS on both themes; unit tests of the checker itself against known
  pass/fail color pairs;
* integrity checker unit-tested with a broken manifest (missing dark resolution, missing
  typography style);
* inverted-dark fixture rejected;
* repair invocation path covered with a mocked provider;
* validators run without any network access (pure code proof).

## Final report

```text
PATCH 026A.2 completed.
art director: PASS/FAIL
design system generator: PASS/FAIL
color/typography/spacing/radius/shadow tokens complete: PASS/FAIL
semantic light/dark parity of token names: PASS/FAIL
accessibility contrast (both themes): PASS/FAIL
dark != inverted light: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
