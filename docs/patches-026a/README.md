# PATCH 026A — Autonomous NOFIDA AI Product Designer: план исполнения

Спецификация PATCH 026A разбита на **9 самодостаточных саб-патчей**. Каждый файл в этой папке —
готовый промт для отдельной сессии Sonnet-5: скопировать содержимое файла в новую сессию целиком.
Каждый саб-патч заканчивается собственной верификацией и коммитом.

## Порядок сессий

```text
026A.0 ──► 026A.1 ──► 026A.2 ──► 026A.3 ──► 026A.4 ──► 026A.5 ──► 026A.7 ──► 026A.8
   │                                                                 ▲
   └──────────────► 026A.6 (независимый, параллельно) ───────────────┘
```

| Саб-патч | Файл | Содержание |
|---|---|---|
| 026A.0 | [PATCH-026A.0-foundation.md](PATCH-026A.0-foundation.md) | Токен-метаданные в Scene Model, фича-флаги, реестр 11 задач, оркестратор, контракты |
| 026A.1 | [PATCH-026A.1-product-reasoning.md](PATCH-026A.1-product-reasoning.md) | Brief Interpreter + Product/UX Architect |
| 026A.2 | [PATCH-026A.2-visual-language.md](PATCH-026A.2-visual-language.md) | Art Director + Design System Generator + contrast-checker |
| 026A.3 | [PATCH-026A.3-components-assets.md](PATCH-026A.3-components-assets.md) | Component Architect + Asset Resolver |
| 026A.4 | [PATCH-026A.4-layout-scene.md](PATCH-026A.4-layout-scene.md) | Layout Engine + Scene Builder + token-coverage |
| 026A.5 | [PATCH-026A.5-theme-pairing.md](PATCH-026A.5-theme-pairing.md) | Парные light/dark борды, parity-чекер |
| 026A.6 | [PATCH-026A.6-canvas-capture.md](PATCH-026A.6-canvas-capture.md) | Скриншот отрендеренного канваса (блокер критика) |
| 026A.7 | [PATCH-026A.7-visual-critic-repair.md](PATCH-026A.7-visual-critic-repair.md) | Visual Critic + Repair Loop (≤3 прохода) |
| 026A.8 | [PATCH-026A.8-handoff-acceptance.md](PATCH-026A.8-handoff-acceptance.md) | Handoff Generator + UX-воркфлоу + приёмка + деплой |

## Сквозные решения (зафиксированы, не пересматриваются внутри сессий)

1. `ALLOW_BULK_UPDATE=false` сохраняется. Repair-цикл = rollback борда + идемпотентный re-create,
   не mod-obj.
2. LLM никогда не эмитит Penpot Transit / UUID / `update-file` payload. Единственный низкоуровневый
   путь записи — Scene Compiler 025A (`services/nofida-hub-adapter/ai/scene/`).
3. Детерминированное — кодом, творческое — LLM: Layout Engine, contrast-checker,
   token-coverage-валидатор, parity-чекер, handoff-генератор — чистый код без LLM-вызовов.
4. Любое изменение `ai/scene/*.mjs` требует `scripts/sync-shared-scene.sh` +
   `scripts/check-shared-scene-sync.sh` (браузерное зеркало `branding/ai-core/designer/scene/*.js`).
5. Межэтапные JSON-контракты фиксируются в 026A.0 (`ai/designer/contracts.mjs`) и дальше неизменны.
6. Сквозная фикстура для всех эпиков — запрос про трекер женского цикла (спека §16).
7. Только одноразовые тестовые файлы Penpot; реальные пользовательские файлы не трогать.
8. Каждая сессия завершается: свой verify + регрессия `scripts/verify-025a-scene-pipeline.mjs` +
   `check-shared-scene-sync.sh` + отчёт PASS/FAIL + один коммит.

## Риски (владелец — соответствующий саб-патч)

- **026A.4**: `MAX_NODES=140` на борд — месячный календарь может упереться; бюджетирование или
  мотивированное поднятие лимита.
- **026A.6**: скриншот-инфраструктуры в репо нет вообще; исследовательская задача
  (canvas capture vs Penpot export).
- **026A.0**: 8+ LLM-этапов на запрос — оркестратор обязан кэшировать промежуточные артефакты.

Деплой (026A.8): git на сервере нет — scp изменённых файлов + `docker rebuild --no-cache`
для фронтенда; фича-флаги включаются только после live-верификации.
