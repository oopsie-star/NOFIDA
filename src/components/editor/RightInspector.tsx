import { Braces, Lock, SlidersHorizontal, Type } from "lucide-react";
import { tr } from "../../i18n";
import {
  getSelectedLayer,
  useDaosStore
} from "../../store/useDaosStore";
import type { LayerNode } from "../../types";

export function RightInspector() {
  const language = useDaosStore((state) => state.language);
  const mode = useDaosStore((state) => state.mode);
  const project = useDaosStore((state) => state.project);
  const selectedLayer = useDaosStore(getSelectedLayer);
  const updateSelectedLayer = useDaosStore((state) => state.updateSelectedLayer);

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

  if (mode === "tokens") {
    return (
      <aside className="right-inspector">
        <div className="inspector-header">
          <Braces size={17} />
          <span>{tr(language, "tokens.title")}</span>
        </div>

        <p className="inspector-empty">{tr(language, "tokens.description")}</p>

        <div className="token-list">
          {project.tokens.map((token) => (
            <div className="token-row" key={token.id}>
              <div>
                <span>{token.name}</span>
                <small>{token.type}</small>
              </div>

              <code>{token.value}</code>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-inspector">
      <div className="inspector-header">
        <SlidersHorizontal size={17} />
        <span>{tr(language, "inspector.title")}</span>
      </div>

      {!selectedLayer && (
        <div className="inspector-empty">
          <Lock size={22} />
          <p>{tr(language, "inspector.noSelection")}</p>
        </div>
      )}

      {selectedLayer && (
        <div className="inspector-stack">
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