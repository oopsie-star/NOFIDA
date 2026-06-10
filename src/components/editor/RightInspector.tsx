import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  Lock,
  SlidersHorizontal,
  Trash2,
  Type,
  Unlock
} from "lucide-react";
import { useMemo, useState } from "react";
import { foundationTokens } from "../../data/seed";
import { tr } from "../../i18n";
import {
  getActivePage,
  getSelectedLayer,
  useDaosStore
} from "../../store/useDaosStore";
import type {
  AlignMode,
  DesignToken,
  DistributionAxis,
  LayerNode
} from "../../types";
import { getLayerCss, getLayerHandoffRows, getLayerJson } from "../../utils/handoff";

type CopiedTarget = "css" | "json" | undefined;

const alignActions: Array<{ mode: AlignMode; labelKey: string }> = [
  { mode: "left", labelKey: "align.left" },
  { mode: "centerX", labelKey: "align.centerX" },
  { mode: "right", labelKey: "align.right" },
  { mode: "top", labelKey: "align.top" },
  { mode: "centerY", labelKey: "align.centerY" },
  { mode: "bottom", labelKey: "align.bottom" }
];

const distributionActions: Array<{
  axis: DistributionAxis;
  labelKey: string;
}> = [
  { axis: "horizontal", labelKey: "distribute.horizontal" },
  { axis: "vertical", labelKey: "distribute.vertical" }
];

const codeBlockStyle = {
  margin: 0,
  maxHeight: 260,
  overflow: "auto",
  borderRadius: 12,
  border: "1px solid #dbe2ee",
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 12,
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap" as const
};

const tokenInputStyle = {
  width: "100%",
  border: "1px solid #dbe2ee",
  borderRadius: 9,
  padding: "7px 9px",
  color: "#0f172a",
  background: "#ffffff",
  fontSize: 12,
  outline: "none"
};

function groupTokens(tokens: DesignToken[]): Array<[string, DesignToken[]]> {
  const groups = new Map<string, DesignToken[]>();

  for (const token of tokens) {
    const existing = groups.get(token.group) ?? [];
    existing.push(token);
    groups.set(token.group, existing);
  }

  return Array.from(groups.entries());
}

function isFontSizeToken(token: DesignToken): boolean {
  return token.type === "font" && token.name.startsWith("font.size.");
}

function getSelectionSummary(language: "ru" | "en", count: number): string {
  return `${tr(language, "selection.count")}: ${count}`;
}

export function RightInspector() {
  const [copiedTarget, setCopiedTarget] = useState<CopiedTarget>();

  const language = useDaosStore((state) => state.language);
  const mode = useDaosStore((state) => state.mode);
  const project = useDaosStore((state) => state.project);
  const activePage = useDaosStore(getActivePage);
  const selectedLayer = useDaosStore(getSelectedLayer);
  const selectedLayerIds = useDaosStore((state) => state.selectedLayerIds);
  const updateSelectedLayer = useDaosStore((state) => state.updateSelectedLayer);
  const deleteSelectedLayers = useDaosStore((state) => state.deleteSelectedLayers);
  const duplicateSelectedLayers = useDaosStore(
    (state) => state.duplicateSelectedLayers
  );
  const moveSelectedLayer = useDaosStore((state) => state.moveSelectedLayer);
  const alignSelectedLayers = useDaosStore((state) => state.alignSelectedLayers);
  const distributeSelectedLayers = useDaosStore(
    (state) => state.distributeSelectedLayers
  );
  const toggleLayerVisibility = useDaosStore((state) => state.toggleLayerVisibility);
  const toggleLayerLock = useDaosStore((state) => state.toggleLayerLock);
  const installFoundationTokens = useDaosStore(
    (state) => state.installFoundationTokens
  );
  const updateTokenValue = useDaosStore((state) => state.updateTokenValue);
  const applyTokenToSelectedLayer = useDaosStore(
    (state) => state.applyTokenToSelectedLayer
  );

  const selectedCount = selectedLayerIds.length;
  const isMultiSelection = selectedCount > 1;
  const selectedLayers = useMemo(() => {
    const selectedSet = new Set(selectedLayerIds);
    return activePage.layers.filter((layer) => selectedSet.has(layer.id));
  }, [activePage.layers, selectedLayerIds]);
  const tokens = project.tokens ?? [];
  const tokenGroups = useMemo(() => groupTokens(tokens), [tokens]);
  const needsFoundationTokens = foundationTokens.some(
    (token) => !tokens.some((existing) => existing.id === token.id)
  );

  const handoffRows = useMemo(
    () => (selectedLayer ? getLayerHandoffRows(selectedLayer) : []),
    [selectedLayer]
  );

  const handoffCss = useMemo(
    () => (selectedLayer ? getLayerCss(selectedLayer) : ""),
    [selectedLayer]
  );

  const handoffJson = useMemo(
    () => (selectedLayer ? getLayerJson(selectedLayer) : ""),
    [selectedLayer]
  );

  function updateNumber(
    field: "x" | "y" | "width" | "height" | "radius",
    value: string
  ) {
    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      return;
    }

    updateSelectedLayer({
      [field]: numericValue
    } as Partial<LayerNode>);
  }

  async function copyText(target: "css" | "json", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      window.setTimeout(() => {
        setCopiedTarget(undefined);
      }, 1200);
    } catch {
      setCopiedTarget(undefined);
    }
  }

  if (mode === "tokens") {
    return (
      <aside className="right-inspector">
        <div className="inspector-header">
          <Braces size={17} />
          <span>{tr(language, "tokens.title")}</span>
        </div>

        <div className="inspector-stack">
          <p className="inspector-empty" style={{ minHeight: 0 }}>
            {tr(language, "tokens.description")}
          </p>

          {needsFoundationTokens && (
            <button type="button" onClick={installFoundationTokens}>
              {tr(language, "tokens.installFoundation")}
            </button>
          )}

          <p className="inspector-empty" style={{ minHeight: 0, paddingTop: 0 }}>
            {isMultiSelection
              ? getSelectionSummary(language, selectedCount)
              : selectedLayer
                ? `${tr(language, "tokens.selectedLayer")}: ${selectedLayer.name}`
                : tr(language, "tokens.noSelectedLayer")}
          </p>

          {tokenGroups.map(([group, groupItems]) => (
            <section className="inspector-section" key={group}>
              <div className="section-title">{tr(language, group)}</div>

              <div className="token-list" style={{ padding: 0 }}>
                {groupItems.map((token) => (
                  <div className="token-row" key={token.id}>
                    <div>
                      <span>{token.name}</span>
                      <small>{token.type}</small>
                    </div>

                    <input
                      style={tokenInputStyle}
                      value={token.value}
                      onChange={(event) =>
                        updateTokenValue(token.id, event.target.value)
                      }
                    />

                    {selectedCount > 0 && (
                      <div className="action-grid" style={{ gridTemplateColumns: "1fr" }}>
                        {token.type === "color" && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyTokenToSelectedLayer(token.id, "fill")}
                            >
                              {tr(language, "tokens.applyFill")}
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTokenToSelectedLayer(token.id, "stroke")}
                            >
                              {tr(language, "tokens.applyStroke")}
                            </button>
                          </>
                        )}

                        {token.type === "radius" && (
                          <button
                            type="button"
                            onClick={() => applyTokenToSelectedLayer(token.id, "radius")}
                          >
                            {tr(language, "tokens.applyRadius")}
                          </button>
                        )}

                        {isFontSizeToken(token) && (
                          <button
                            type="button"
                            onClick={() => applyTokenToSelectedLayer(token.id, "fontSize")}
                          >
                            {tr(language, "tokens.applyFontSize")}
                          </button>
                        )}
                      </div>
                    )}

                    {token.description && <small>{token.description}</small>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    );
  }

  if (mode === "inspect") {
    return (
      <aside className="right-inspector">
        <div className="inspector-header">
          <Code2 size={17} />
          <span>{tr(language, "inspect.title")}</span>
        </div>

        {selectedCount === 0 && (
          <div className="inspector-empty">
            <FileJson size={24} />
            <p>{tr(language, "inspect.noSelection")}</p>
          </div>
        )}

        {isMultiSelection && (
          <div className="inspector-stack">
            <section className="inspector-section">
              <div className="section-title">{tr(language, "inspect.summary")}</div>

              <div className="token-list" style={{ padding: 0 }}>
                <div className="token-row">
                  <div>
                    <span>{getSelectionSummary(language, selectedCount)}</span>
                    <small>{tr(language, "selection.multiple")}</small>
                  </div>

                  <code>{selectedCount}</code>
                </div>

                {selectedLayers.map((layer) => (
                  <div className="token-row" key={layer.id}>
                    <div>
                      <span>{layer.name}</span>
                      <small>{layer.id}</small>
                    </div>

                    <code>{layer.type}</code>
                  </div>
                ))}
              </div>
            </section>

            <p className="inspector-empty" style={{ minHeight: 0, padding: 0 }}>
              {tr(language, "selection.multiple")}
            </p>
          </div>
        )}

        {selectedLayer && !isMultiSelection && (
          <div className="inspector-stack">
            <section className="inspector-section">
              <div className="section-title">{tr(language, "inspect.summary")}</div>

              <div className="token-list" style={{ padding: 0 }}>
                {handoffRows.map((row) => (
                  <div className="token-row" key={row.label}>
                    <div>
                      <span>{row.label}</span>
                    </div>

                    <code>{row.value}</code>
                  </div>
                ))}
              </div>
            </section>

            <section className="inspector-section">
              <div className="section-title">
                <Code2 size={14} />
                {tr(language, "inspect.css")}
              </div>

              <div className="action-grid">
                <button type="button" onClick={() => copyText("css", handoffCss)}>
                  {copiedTarget === "css" ? <Check size={14} /> : <Copy size={14} />}
                  {copiedTarget === "css"
                    ? tr(language, "inspect.copied")
                    : tr(language, "inspect.copyCss")}
                </button>
              </div>

              <pre style={codeBlockStyle}>{handoffCss}</pre>
            </section>

            <section className="inspector-section">
              <div className="section-title">
                <FileJson size={14} />
                {tr(language, "inspect.json")}
              </div>

              <div className="action-grid">
                <button type="button" onClick={() => copyText("json", handoffJson)}>
                  {copiedTarget === "json" ? <Check size={14} /> : <Copy size={14} />}
                  {copiedTarget === "json"
                    ? tr(language, "inspect.copied")
                    : tr(language, "inspect.copyJson")}
                </button>
              </div>

              <pre style={codeBlockStyle}>{handoffJson}</pre>
            </section>

            <p className="inspector-empty" style={{ minHeight: 0, padding: 0 }}>
              {tr(language, "inspect.note")}
            </p>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="right-inspector">
      <div className="inspector-header">
        <SlidersHorizontal size={17} />
        <span>{tr(language, "inspector.title")}</span>
      </div>

      {selectedCount === 0 && (
        <div className="inspector-empty">
          <Lock size={22} />
          <p>{tr(language, "inspector.noSelection")}</p>
        </div>
      )}

      {isMultiSelection && (
        <div className="inspector-stack">
          <section className="inspector-section">
            <div className="section-title">{tr(language, "selection.multiple")}</div>
            <div className="type-pill">{getSelectionSummary(language, selectedCount)}</div>
          </section>

          <section className="inspector-section">
            <div className="section-title">{tr(language, "inspector.actions")}</div>

            <div className="action-grid multi-selection-actions">
              <button type="button" onClick={duplicateSelectedLayers}>
                <Copy size={14} />
                {tr(language, "action.duplicate")}
              </button>

              <button
                className="danger-action"
                type="button"
                onClick={deleteSelectedLayers}
              >
                <Trash2 size={14} />
                {tr(language, "action.delete")}
              </button>

              {alignActions.map((action) => (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => alignSelectedLayers(action.mode)}
                >
                  {tr(language, action.labelKey)}
                </button>
              ))}

              {distributionActions.map((action) => (
                <button
                  key={action.axis}
                  type="button"
                  onClick={() => distributeSelectedLayers(action.axis)}
                >
                  {tr(language, action.labelKey)}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {selectedLayer && !isMultiSelection && (
        <div className="inspector-stack">
          <section className="inspector-section">
            <div className="section-title">{tr(language, "inspector.actions")}</div>

            <div className="action-grid">
              <button type="button" onClick={duplicateSelectedLayers}>
                <Copy size={14} />
                {tr(language, "action.duplicate")}
              </button>

              <button type="button" onClick={() => moveSelectedLayer("forward")}>
                <ArrowUp size={14} />
                {tr(language, "action.moveUp")}
              </button>

              <button type="button" onClick={() => moveSelectedLayer("backward")}>
                <ArrowDown size={14} />
                {tr(language, "action.moveDown")}
              </button>

              <button
                type="button"
                onClick={() => toggleLayerVisibility(selectedLayer.id)}
              >
                {selectedLayer.visible ? <EyeOff size={14} /> : <Eye size={14} />}
                {tr(language, selectedLayer.visible ? "action.hide" : "action.show")}
              </button>

              <button type="button" onClick={() => toggleLayerLock(selectedLayer.id)}>
                {selectedLayer.locked ? <Unlock size={14} /> : <Lock size={14} />}
                {tr(language, selectedLayer.locked ? "action.unlock" : "action.lock")}
              </button>

              <button
                className="danger-action"
                type="button"
                onClick={deleteSelectedLayers}
              >
                <Trash2 size={14} />
                {tr(language, "action.delete")}
              </button>
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-title">{tr(language, "inspector.layerType")}</div>

            <label className="field-row wide">
              <span>{tr(language, "inspector.name")}</span>
              <input
                value={selectedLayer.name}
                onChange={(event) =>
                  updateSelectedLayer({
                    name: event.target.value
                  })
                }
              />
            </label>

            <div className="type-pill">{selectedLayer.type}</div>
          </section>

          <section className="inspector-section">
            <div className="section-title">{tr(language, "inspector.position")}</div>

            <div className="field-grid">
              <label className="field-row">
                <span>{tr(language, "field.x")}</span>
                <input
                  type="number"
                  value={selectedLayer.x}
                  onChange={(event) => updateNumber("x", event.target.value)}
                />
              </label>

              <label className="field-row">
                <span>{tr(language, "field.y")}</span>
                <input
                  type="number"
                  value={selectedLayer.y}
                  onChange={(event) => updateNumber("y", event.target.value)}
                />
              </label>

              <label className="field-row">
                <span>{tr(language, "field.width")}</span>
                <input
                  type="number"
                  value={selectedLayer.width}
                  onChange={(event) => updateNumber("width", event.target.value)}
                />
              </label>

              <label className="field-row">
                <span>{tr(language, "field.height")}</span>
                <input
                  type="number"
                  value={selectedLayer.height}
                  onChange={(event) => updateNumber("height", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-title">{tr(language, "inspector.appearance")}</div>

            <label className="field-row wide">
              <span>{tr(language, "field.radius")}</span>
              <input
                type="number"
                value={selectedLayer.radius ?? 0}
                onChange={(event) => updateNumber("radius", event.target.value)}
              />
            </label>

            <label className="field-row wide">
              <span>{tr(language, "field.fill")}</span>
              <input
                value={selectedLayer.fill ?? ""}
                onChange={(event) =>
                  updateSelectedLayer({
                    fill: event.target.value
                  })
                }
              />
            </label>

            <label className="field-row wide">
              <span>{tr(language, "field.stroke")}</span>
              <input
                value={selectedLayer.stroke ?? ""}
                onChange={(event) =>
                  updateSelectedLayer({
                    stroke: event.target.value
                  })
                }
              />
            </label>
          </section>

          {(selectedLayer.type === "text" || selectedLayer.type === "button") && (
            <section className="inspector-section">
              <div className="section-title">
                <Type size={14} />
                {tr(language, "inspector.content")}
              </div>

              <label className="field-row wide textarea-field">
                <span>{tr(language, "field.text")}</span>
                <textarea
                  value={selectedLayer.text ?? ""}
                  onChange={(event) =>
                    updateSelectedLayer({
                      text: event.target.value
                    })
                  }
                />
              </label>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
