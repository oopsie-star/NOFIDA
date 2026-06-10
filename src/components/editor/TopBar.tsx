import {
  Braces,
  Cloud,
  Download,
  Eye,
  Languages,
  MousePointer2,
  PenTool,
  Play,
  Redo2,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Undo2,
  Upload
} from "lucide-react";
import { useRef, useState } from "react";
import { tr } from "../../i18n";
import { useDaosStore } from "../../store/useDaosStore";
import type { EditorMode, Language } from "../../types";
import {
  buildNofidaSnapshot,
  downloadNofidaSnapshot,
  parseNofidaFile,
  readTextFile
} from "../../utils/nofidaFile";

const modes: Array<{
  id: EditorMode;
  icon: typeof PenTool;
  labelKey: string;
}> = [
  { id: "design", icon: PenTool, labelKey: "mode.design" },
  { id: "prototype", icon: Play, labelKey: "mode.prototype" },
  { id: "inspect", icon: MousePointer2, labelKey: "mode.inspect" },
  { id: "tokens", icon: Braces, labelKey: "mode.tokens" }
];

export function TopBar() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | undefined>();

  const language = useDaosStore((state) => state.language);
  const mode = useDaosStore((state) => state.mode);
  const setMode = useDaosStore((state) => state.setMode);
  const setLanguage = useDaosStore((state) => state.setLanguage);
  const project = useDaosStore((state) => state.project);
  const activeFileId = useDaosStore((state) => state.activeFileId);
  const activePageId = useDaosStore((state) => state.activePageId);
  const selectedLayerId = useDaosStore((state) => state.selectedLayerId);
  const selectedLayerIds = useDaosStore((state) => state.selectedLayerIds);
  const zoom = useDaosStore((state) => state.zoom);
  const importSnapshot = useDaosStore((state) => state.importSnapshot);
  const resetLocalEditorState = useDaosStore(
    (state) => state.resetLocalEditorState
  );
  const undo = useDaosStore((state) => state.undo);
  const redo = useDaosStore((state) => state.redo);
  const canUndo = useDaosStore((state) => state.history.past.length > 0);
  const canRedo = useDaosStore((state) => state.history.future.length > 0);
  const activeFileName =
    project.files.find((file) => file.id === activeFileId)?.name ??
    project.files[0]?.name ??
    tr(language, "top.file");

  const nextLanguage: Language = language === "ru" ? "en" : "ru";

  function showTransferStatus(message: string) {
    setTransferStatus(message);

    window.setTimeout(() => {
      setTransferStatus(undefined);
    }, 1600);
  }

  function handleExport() {
    const snapshot = buildNofidaSnapshot({
      project,
      activeFileId,
      activePageId,
      selectedLayerId,
      selectedLayerIds,
      zoom,
      mode,
      language
    });

    downloadNofidaSnapshot(snapshot);
    showTransferStatus(tr(language, "top.exported"));
  }

  async function handleFileImport(file: File) {
    try {
      const rawText = await readTextFile(file);
      const result = parseNofidaFile(rawText);

      if (!result.ok) {
        showTransferStatus(`${tr(language, "top.importError")}: ${result.error}`);
        return;
      }

      importSnapshot(result.snapshot);
      showTransferStatus(tr(result.snapshot.language, "top.imported"));
    } catch (error) {
      const message = error instanceof Error ? error.message : tr(language, "top.importError");
      showTransferStatus(`${tr(language, "top.importError")}: ${message}`);
    }
  }

  function handleReset() {
    resetLocalEditorState();
  }

  return (
    <header className="top-bar">
      <div className="brand-block">
        <div className="brand-mark">
          <Sparkles size={17} />
        </div>

        <div>
          <div className="brand-title">{tr(language, "brand.name")}</div>
          <div className="brand-subtitle">{tr(language, "brand.subtitle")}</div>
        </div>
      </div>

      <div className="file-pill">
        <span className="file-dot" />
        <span>{activeFileName}</span>
      </div>

      <nav className="mode-switcher" aria-label="Editor modes">
        {modes.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === mode;

          return (
            <button
              className={isActive ? "mode-button active" : "mode-button"}
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
            >
              <Icon size={15} />
              <span>{tr(language, item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="top-actions">
        <button
          className="ghost-button top-action-secondary"
          type="button"
          disabled={!canUndo}
          title={tr(language, "top.undoTitle")}
          onClick={undo}
        >
          <Undo2 size={15} />
          <span>{tr(language, "top.undo")}</span>
        </button>

        <button
          className="ghost-button top-action-secondary"
          type="button"
          disabled={!canRedo}
          title={tr(language, "top.redoTitle")}
          onClick={redo}
        >
          <Redo2 size={15} />
          <span>{tr(language, "top.redo")}</span>
        </button>

        <button className="ghost-button search-button top-action-secondary" type="button">
          <Search size={15} />
          <span>{tr(language, "top.search")}</span>
        </button>

        <button
          className="ghost-button top-action-core"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={15} />
          <span>{tr(language, "top.import")}</span>
        </button>

        <button
          className="primary-button-small top-action-core"
          type="button"
          onClick={handleExport}
        >
          <Download size={15} />
          <span>{tr(language, "top.export")}</span>
        </button>

        <button
          aria-label={tr(language, "top.reset")}
          className="ghost-button top-action-secondary"
          type="button"
          title={tr(language, "top.resetTitle")}
          onClick={handleReset}
        >
          <RotateCcw size={15} />
          <span>{tr(language, "top.reset")}</span>
        </button>

        <button className="ghost-button top-action-secondary" type="button">
          <Eye size={15} />
          <span>{tr(language, "top.present")}</span>
        </button>

        <button className="primary-button-small top-action-secondary" type="button">
          <Share2 size={15} />
          <span>{tr(language, "top.share")}</span>
        </button>

        <button
          className="language-button"
          type="button"
          onClick={() => setLanguage(nextLanguage)}
          title={tr(language, "status.language")}
        >
          <Languages size={16} />
          <span>{language.toUpperCase()}</span>
        </button>

        <div className="save-status">
          <Cloud size={14} />
          <span>{tr(language, "top.saved")}</span>
        </div>

        {transferStatus && <div className="transfer-status">{transferStatus}</div>}

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          accept=".nofida.json,.json,application/json"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              void handleFileImport(file);
            }

            event.currentTarget.value = "";
          }}
        />
      </div>
    </header>
  );
}
