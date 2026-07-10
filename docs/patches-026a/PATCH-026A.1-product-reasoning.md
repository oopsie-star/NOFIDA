# PATCH 026A.1 — Product Reasoning: Brief Interpreter + Product/UX Architect

Role: Senior product designer and AI design-tool engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved PATCH 026A.0 (contracts in
  `services/nofida-hub-adapter/ai/designer/contracts.mjs`, orchestrator `pipeline.mjs`,
  registry stubs `designer_brief_interpreter` / `designer_product_architect`, flags off).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads.
2. `ALLOW_BULK_UPDATE=false` stays. No canvas mutation in this sub-patch at all.
3. Contracts from 026A.0 (`ProductBrief`, `ProductArchitecture`) are immutable — implement to
   them, do not change them.
4. Safety: no real user files, no DB writes, no Caddy/Postgres/Valkey/renderer changes.
5. Finish with: verify section PASS, `node scripts/verify-025a-scene-pipeline.mjs` regression
   PASS, PASS/FAIL report, one commit.

## Key files

| File | Why |
|---|---|
| `services/nofida-hub-adapter/ai/designer/contracts.mjs` | target output schemas |
| `services/nofida-hub-adapter/ai/designer/pipeline.mjs` | wire real stages in place of stubs |
| `services/nofida-hub-adapter/ai/prompt-registry.mjs` | fill the two stub prompts |
| `services/nofida-hub-adapter/ai/thread-store.mjs` | session artifact persistence pattern |
| `services/nofida-hub-adapter/ai-service.mjs` | provider invocation |

## Task 1: Brief Interpreter

Create `services/nofida-hub-adapter/ai/designer/brief-interpreter.mjs` and the real
`designer_brief_interpreter` prompt.

Input:

```json
{
  "request": "natural language product request",
  "projectContext": {},
  "referenceImages": [],
  "existingDesignContext": null,
  "targetPlatform": "auto"
}
```

Output: `ProductBrief` contract (productType, domain, targetUsers, primaryJob, requiredScreens,
requiredFeatures, contentPriorities, constraints, platform{type,width,height,safeArea},
assumptions, confidence).

Prompt rules:

* infer platform if obvious (mobile product request → `mobile`, 393×852, safeArea true);
* infer likely audience and accessibility concerns;
* identify mandatory content and missing-but-necessary UX elements;
* separate product requirements from visual assumptions (visual goes to `assumptions`);
* never ask the founder for coordinates, colors, token values, spacing, fonts or Penpot schema;
* ask a clarifying question only if the product request is fundamentally ambiguous — encode this
  as a structured `needsClarification` refusal path, not free text;
* record everything guessed in `assumptions` and reflect uncertainty in `confidence`.

The module must: build the prompt from registry, invoke the active provider, parse/validate the
response against `ProductBrief`, retry once with a repair instruction on contract violation,
then fail structurally.

## Task 2: Product / UX Architect

Create `services/nofida-hub-adapter/ai/designer/product-architect.mjs` and the real
`designer_product_architect` prompt.

Input: `ProductBrief`. Output: `ProductArchitecture` contract:

```json
{
  "flows": [],
  "screens": [
    {
      "id": "home-day",
      "purpose": "",
      "primaryAction": "",
      "secondaryActions": [],
      "sections": [],
      "states": [],
      "contentRequirements": []
    }
  ]
}
```

It must decide: required screens; primary/secondary user actions; information hierarchy;
navigation model; empty/loading/error states; interaction states; content grouping;
accessibility requirements. Screen `id`s are stable kebab-case and become the root of
`semanticId`s downstream.

## Acceptance fixture (do not put any of the expected answers into the prompts)

Feed only this request through pipeline stages 1–2:

`Создай главный экран мобильного приложения для отслеживания женского цикла. Нужны светлая и тёмная версии, прогноз следующей менструации, недельный календарь, сводка цикла и подробный календарь месяца.`

Expected without hints:

* brief: `productType=mobile_app`, `domain` ≈ women_health, platform mobile 393×852 safeArea,
  light+dark requirement captured, no clarifying question;
* architecture infers sections covering at least: date/header; week calendar; prediction
  summary; primary period action; pregnancy probability/status; section navigation;
  cycle summary; monthly calendar.

Verification of "inferred, not prompted": grep your prompt sources — none of the fixture's
expected section names may appear as literals in the system prompts (generic design knowledge
is fine; fixture-specific answers are not).

## Verification

Append section "026A.1" to `scripts/verify-026a-autonomous-designer.mjs`:

* contract-valid outputs for the fixture (live LLM call behind an env guard, e.g.
  `NOFIDA_AI_VERIFY_LIVE=1`; otherwise validate recorded fixture artifacts);
* required sections present (case-insensitive semantic match list);
* retry-on-invalid path covered with a mocked provider returning broken JSON once;
* orchestrator caches stage artifacts: second run does not re-invoke the provider (assert via
  invocation counter);
* no prompt literal leakage per the grep rule above.

## Final report

```text
PATCH 026A.1 completed.
brief interpreter: PASS/FAIL
product architect: PASS/FAIL
fixture sections inferred without hints: PASS/FAIL
contract validation + retry path: PASS/FAIL
stage caching: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
