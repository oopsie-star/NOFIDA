import { Minus, Plus } from "lucide-react";
import { tr } from "../../i18n";
import {
  getSelectedLayer,
  useDaosStore
} from "../../store/useDaosStore";

export function StatusBar() {
  const language = useDaosStore((state) => state.language);
  const zoom = useDaosStore((state) => state.zoom);
  const setZoom = useDaosStore((state) => state.setZoom);
  const selectedLayer = useDaosStore(getSelectedLayer);
  const selectedLayerIds = useDaosStore((state) => state.selectedLayerIds);
  const activeTool = useDaosStore((state) => state.activeTool);
  const selectedCount = selectedLayerIds.length;

  function getSelectionLabel(): string {
    if (selectedCount > 1) {
      return `${tr(language, "selection.count")}: ${selectedCount}`;
    }

    return selectedLayer?.name ?? tr(language, "status.none");
  }

  return (
    <footer className="status-bar">
      <div>
        <strong>{tr(language, "status.selected")}:</strong>{" "}
        <span>{getSelectionLabel()}</span>
      </div>

      <div className="status-hotkeys">{tr(language, "canvas.hotkeys")}</div>

      <div className="status-right">
        <span>
          {tr(language, "status.tool")}: {tr(language, `tool.${activeTool}`)}
        </span>

        <span>
          {tr(language, "status.zoom")}: {zoom}%
        </span>

        <button type="button" onClick={() => setZoom(zoom - 10)}>
          <Minus size={13} />
        </button>

        <button type="button" onClick={() => setZoom(zoom + 10)}>
          <Plus size={13} />
        </button>

        <span>
          {tr(language, "status.language")}: {language.toUpperCase()}
        </span>
      </div>
    </footer>
  );
}
