# PATCH 026A.7 — Visual Critic + Automatic Repair Loop

Role: Senior design-QA and AI engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0–026A.6. Requires 026A.5 (paired
  boards) and 026A.6 (canvas capture).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads. Repairs are expressed as
   Scene-Model-level operations.
2. `ALLOW_BULK_UPDATE=false` stays. A repair pass is applied as **rollback of the affected
   board(s) + idempotent re-create** from the repaired Scene Model — never `mod-obj`.
3. Maximum 3 repair passes. Never claim success below threshold.
4. Disposable test files only; gated behind `nofida_ai_visual_critic_v1`.
5. Finish with: verify PASS, `verify-025a` regression PASS, report, one commit.

## Key files

`services/nofida-hub-adapter/ai/designer/{pipeline.mjs,contracts.mjs}` (`CritiqueReport`
contract), `ai/prompt-registry.mjs` (fill `designer_visual_critic`, `designer_repair_planner`),
`ai-service.mjs` (`MODEL_CAPABILITIES` — vision check at ~line 262:
`modalities.includes("image")`), `branding/ai-core/designer/canvas-capture.js` (026A.6),
`branding/ai-core/designer/persistence-adapter.js` (rollback + idempotency, do not weaken).

## Task 1: Visual Critic

Create `services/nofida-hub-adapter/ai/designer/visual-critic.mjs`.

Input: screenshot(s) (light + dark) + Scene Model + `DesignSystemManifest` + original
`ProductBrief`. Output: `CritiqueReport`:

```json
{
  "score": 0,
  "issues": [
    { "severity": "high", "nodeId": "", "category": "spacing", "message": "", "recommendedOperation": {} }
  ],
  "approved": false
}
```

Evaluate: hierarchy; alignment; spacing; balance; contrast; typography; consistency; density;
clipping; overflow; token usage; component consistency; light/dark parity; accessibility;
generic/unfinished look.

Capability routing:

* active model supports vision (via `ai-service.mjs` capability check) → send screenshots;
* no vision → **rule-based structural critic** (pure code): clipping/overflow from Scene Model
  geometry, contrast from resolved colors (026A.2 checker), gap uniformity, node overlap;
  report `confidence: "reduced"` in the output.

`nodeId` in issues refers to `semanticId` (never Penpot UUIDs).

Approval threshold: `score >= 85`, no critical issue, no clipping, no unsupported/missing
nodes, no contrast failure for primary text/actions.

## Task 2: Repair Planner + loop

Create `services/nofida-hub-adapter/ai/designer/repair-planner.mjs` and wire the loop into
`pipeline.mjs`:

```text
Generate → Render → Capture → Critique → Repair operations → repaired Scene Model
→ rollback boards → idempotent re-create → Capture → Critique → …  (max 3 passes)
```

* repairs are **local** Scene Model transforms addressed by `semanticId` (resize text box,
  bump contrast token resolution, align siblings, normalize gaps, reduce oversized type,
  improve dark surface separation, fix calendar day spacing) — full regeneration only if the
  planner explicitly reports local repair impossible;
* each pass stores its artifacts (scene, screenshot, report) in the session store;
* below 85 after 3 passes → return the **best-scoring** version, report unresolved issues,
  do not claim success;
* the loop must re-run the token-coverage validator (026A.4) and parity checker (026A.5) after
  every repair — a repair may not break those gates.

## Verification

Append section "026A.7":

* seeded-defect test: take the fixture scene, inject a text-clipping defect and a low-contrast
  token resolution → rule-based critic finds both with correct `semanticId`s; repair planner
  produces local operations; after re-create the defects are gone and score improves
  (live LLM parts behind `NOFIDA_AI_VERIFY_LIVE=1`, otherwise mocked provider fixtures);
* loop terminates: mocked critic that always scores 60 → exactly 3 passes, best version
  returned, `approved:false`, unresolved issues listed;
* repair pass performs rollback + re-create (assert via vm-sandbox: `del-obj` then `add-obj`,
  zero `mod-obj`), idempotency keys updated so re-create doesn't collide;
* vision routing: capability stub with image modality → screenshot attached; without →
  rule-based path + reduced confidence flag;
* token-coverage and parity gates re-checked post-repair.

## Final report

```text
PATCH 026A.7 completed.
visual critic (vision path): PASS/FAIL
rule-based fallback + reduced confidence: PASS/FAIL
repair planner (local ops by semanticId): PASS/FAIL
repair applies as rollback + re-create (0 mod-obj): PASS/FAIL
loop max 3 passes, honest failure below 85: PASS/FAIL
post-repair coverage/parity gates: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
