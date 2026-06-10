import {
  Box,
  Component,
  Copy,
  Eye,
  EyeOff,
  FileStack,
  Frame,
  Image,
  Layers3,
  LayoutGrid,
  Lock,
  MousePointer2,
  Plus,
  Smartphone,
  Square,
  Trash2,
  Type,
  Unlock
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { tr } from "../../i18n";
import {
  getActiveFile,
  getActivePage,
  useDaosStore
} from "../../store/useDaosStore";
import type { LayerNode, LayerType, SidebarTab } from "../../types";

const layerIcons: Record<LayerType, typeof Square> = {
  frame: Frame,
  group: Box,
  rectangle: Square,
  text: Type,
  button: MousePointer2,
  image: Image
};

interface PageItem {
  id: string;
  name: string;
  type: string;
}

interface LeftSidebarProps {
  manifest: {
    structure: {
      pages: PageItem[];
    };
  };
  activePageId?: string;
  onPageSelect: (pageId: string) => void;
  onAiGenerateLayout: (prompt: string) => void;
}

export function LeftSidebar({
  manifest,
  activePageId: activeManifestPageId,
  onPageSelect,
  onAiGenerateLayout
}: LeftSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("layers");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const language = useDaosStore((state) => state.language);
  const project = useDaosStore((state) => state.project);
  const storeActivePageId = useDaosStore((state) => state.activePageId);
  const selectedLayerIds = useDaosStore((state) => state.selectedLayerIds);
  const setActivePage = useDaosStore((state) => state.setActivePage);
  const createPage = useDaosStore((state) => state.createPage);
  const renamePage = useDaosStore((state) => state.renamePage);
  const duplicatePage = useDaosStore((state) => state.duplicatePage);
  const deletePage = useDaosStore((state) => state.deletePage);
  const selectSingleLayer = useDaosStore((state) => state.selectSingleLayer);
  const toggleLayerSelection = useDaosStore((state) => state.toggleLayerSelection);
  const toggleLayerVisibility = useDaosStore(
    (state) => state.toggleLayerVisibility
  );
  const toggleLayerLock = useDaosStore((state) => state.toggleLayerLock);

  const activeFile = useDaosStore(getActiveFile);
  const activePage = useDaosStore(getActivePage);

  const rootLayers = useMemo(
    () => activePage.layers.filter((layer) => !layer.parentId),
    [activePage.layers]
  );

  const childLayers = useMemo(() => {
    const result = new Map<string, LayerNode[]>();

    for (const layer of activePage.layers) {
      if (!layer.parentId) continue;
      const existing = result.get(layer.parentId) ?? [];
      existing.push(layer);
      result.set(layer.parentId, existing);
    }

    return result;
  }, [activePage.layers]);

  function handleSubmitAiPrompt(e: FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setTimeout(() => {
      onAiGenerateLayout(aiPrompt);
      setAiPrompt("");
      setIsGenerating(false);
    }, 800);
  }

  function renderLayer(layer: LayerNode, depth = 0) {
    const Icon = layerIcons[layer.type];
    const children = childLayers.get(layer.id) ?? [];
    const isSelected = selectedLayerIds.includes(layer.id);
    const VisibilityIcon = layer.visible ? Eye : EyeOff;
    const LockIcon = layer.locked ? Lock : Unlock;

    return (
      <div key={layer.id}>
        <div className={isSelected ? "layer-item selected" : "layer-item"}>
          <button
            className={layer.visible ? "layer-row" : "layer-row muted"}
            style={{ paddingLeft: 10 + depth * 16 }}
            type="button"
            onClick={(event) => {
              if (event.shiftKey) {
                toggleLayerSelection(layer.id);
                return;
              }

              selectSingleLayer(layer.id);
            }}
          >
            <Icon size={14} />
            <span>{layer.name}</span>
          </button>

          <div className="layer-actions">
            <button
              type="button"
              title={tr(language, layer.visible ? "action.hide" : "action.show")}
              onClick={(event) => {
                event.stopPropagation();
                toggleLayerVisibility(layer.id);
              }}
            >
              <VisibilityIcon size={13} />
            </button>

            <button
              type="button"
              title={tr(language, layer.locked ? "action.unlock" : "action.lock")}
              onClick={(event) => {
                event.stopPropagation();
                toggleLayerLock(layer.id);
              }}
            >
              <LockIcon size={13} />
            </button>
          </div>
        </div>

        {children.map((child) => renderLayer(child, depth + 1))}
      </div>
    );
  }

  return (
    <aside className="w-full h-full bg-white border-r border-neutral-200/60 flex flex-col overflow-hidden min-h-0 min-w-0 select-none">

      {/* AI Generation Terminal Header */}
      <div className="p-3 border-b border-neutral-200/60 bg-white flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-[11px] font-mono uppercase tracking-wider font-bold text-neutral-900">
            Nofida Workspace
          </h2>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-neutral-900 text-white">
            AI Core v1
          </span>
        </div>

        <form onSubmit={handleSubmitAiPrompt} className="flex flex-col gap-1.5 mt-1">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ask AI to generate views (e.g., 'Auth Flow')..."
            className="w-full text-[11px] font-mono px-2.5 py-1.5 bg-neutral-50 border border-neutral-200/80 rounded-md focus:outline-none focus:border-neutral-900 focus:bg-white transition-all text-neutral-800 placeholder:text-neutral-400"
            disabled={isGenerating}
          />
          <button
            type="submit"
            disabled={!aiPrompt.trim() || isGenerating}
            className="w-full text-[10px] font-mono font-bold uppercase py-1.5 tracking-wider rounded-md text-white bg-neutral-900 hover:bg-black btn-interact shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Compiling System Vector…" : "Generate Workspace Architecture"}
          </button>
        </form>
      </div>

      {/* Tab Navigation */}
      <div className="sidebar-tabs">
        <button
          className={tab === "pages" ? "sidebar-tab active" : "sidebar-tab"}
          type="button"
          onClick={() => setTab("pages")}
        >
          <FileStack size={15} />
          <span>{tr(language, "sidebar.pages")}</span>
        </button>

        <button
          className={tab === "layers" ? "sidebar-tab active" : "sidebar-tab"}
          type="button"
          onClick={() => setTab("layers")}
        >
          <Layers3 size={15} />
          <span>{tr(language, "sidebar.layers")}</span>
        </button>

        <button
          className={tab === "assets" ? "sidebar-tab active" : "sidebar-tab"}
          type="button"
          onClick={() => setTab("assets")}
        >
          <Component size={15} />
          <span>{tr(language, "sidebar.assets")}</span>
        </button>
      </div>

      <div className="sidebar-content flex-1 overflow-y-auto custom-scrollbar bg-white">
        {tab === "pages" && (
          <section>
            {/* Manifest Workspace Flows */}
            <div className="sidebar-section-title flex items-center justify-between">
              <span>Active Architecture Flows</span>
              <span className="text-neutral-300 text-[10px] font-mono">
                ({manifest.structure.pages.length})
              </span>
            </div>

            <div className="flex flex-col gap-0.5 mb-3">
              {manifest.structure.pages.map((page) => {
                const isActive = page.id === activeManifestPageId;
                const isAiNode = page.id.startsWith("ai_");
                const TypeIcon = page.type === "board" ? LayoutGrid : Smartphone;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => onPageSelect(page.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-all flex items-center justify-between gap-2 border border-transparent ${
                      isActive
                        ? "bg-neutral-900 text-white font-medium shadow-sm hover:bg-neutral-900"
                        : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <TypeIcon
                        size={13}
                        className={isActive ? "opacity-90 shrink-0" : "opacity-50 shrink-0"}
                      />
                      <span className="truncate tracking-tight">{page.name}</span>
                    </div>
                    {isAiNode && (
                      <span
                        className={`shrink-0 text-[8px] font-bold px-1 rounded uppercase tracking-wide ${
                          isActive
                            ? "bg-white/15 text-white"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        AI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Existing store-backed file/page management */}
            <div className="sidebar-section-title">
              {tr(language, "sidebar.currentFile")}
            </div>

            <div className="file-name">{activeFile.name}</div>

            <div className="page-editor-card">
              <div className="page-name-field">
                <span>{tr(language, "page.active")}</span>
                <input
                  aria-label={tr(language, "page.name")}
                  type="text"
                  value={activePage.name}
                  onChange={(event) => renamePage(storeActivePageId, event.target.value)}
                />
              </div>

              <button className="page-create-button" type="button" onClick={createPage}>
                <Plus size={14} />
                <span>{tr(language, "page.create")}</span>
              </button>
            </div>

            <div className="page-list">
              {activeFile.pages.map((page) => {
                const isActive = page.id === storeActivePageId;
                const canDelete = activeFile.pages.length > 1;

                return (
                  <div
                    className={isActive ? "page-item active" : "page-item"}
                    key={page.id}
                  >
                    <button
                      className="page-row"
                      type="button"
                      onClick={() => setActivePage(page.id)}
                    >
                      <span>{page.name}</span>
                      <small>
                        {page.layers.filter((layer) => layer.type === "frame").length}
                      </small>
                    </button>

                    <div className="page-actions">
                      <button
                        type="button"
                        title={tr(language, "page.duplicate")}
                        onClick={(event) => {
                          event.stopPropagation();
                          duplicatePage(page.id);
                        }}
                      >
                        <Copy size={13} />
                      </button>

                      <button
                        disabled={!canDelete}
                        type="button"
                        title={
                          canDelete
                            ? tr(language, "page.delete")
                            : tr(language, "page.protected")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          deletePage(page.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "layers" && (
          <section>
            <div className="sidebar-section-title">
              {tr(language, "sidebar.layers")}
            </div>

            <div className="layers-tree">{rootLayers.map((layer) => renderLayer(layer))}</div>
          </section>
        )}

        {tab === "assets" && (
          <section>
            <div className="sidebar-section-title">
              {tr(language, "sidebar.components")}
            </div>

            <div className="assets-empty">
              <Component size={22} />
              <p>{tr(language, "sidebar.noAssets")}</p>
              <strong>{project.tokens.length} tokens</strong>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
