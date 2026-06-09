import {
  Box,
  Component,
  FileStack,
  Frame,
  Image,
  Layers3,
  MousePointer2,
  Square,
  Type
} from "lucide-react";
import { useMemo, useState } from "react";
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

export function LeftSidebar() {
  const [tab, setTab] = useState<SidebarTab>("layers");
  const language = useDaosStore((state) => state.language);
  const project = useDaosStore((state) => state.project);
  const activePageId = useDaosStore((state) => state.activePageId);
  const selectedLayerId = useDaosStore((state) => state.selectedLayerId);
  const setActivePage = useDaosStore((state) => state.setActivePage);
  const selectLayer = useDaosStore((state) => state.selectLayer);

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

  function renderLayer(layer: LayerNode, depth = 0) {
    const Icon = layerIcons[layer.type];
    const children = childLayers.get(layer.id) ?? [];
    const isSelected = selectedLayerId === layer.id;

    return (
      <div key={layer.id}>
        <button
          className={isSelected ? "layer-row selected" : "layer-row"}
          style={{ paddingLeft: 10 + depth * 16 }}
          type="button"
          onClick={() => selectLayer(layer.id)}
        >
          <Icon size={14} />
          <span>{layer.name}</span>
        </button>

        {children.map((child) => renderLayer(child, depth + 1))}
      </div>
    );
  }

  return (
    <aside className="left-sidebar">
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

      <div className="sidebar-content">
        {tab === "pages" && (
          <section>
            <div className="sidebar-section-title">
              {tr(language, "sidebar.currentFile")}
            </div>

            <div className="file-name">{activeFile.name}</div>

            <div className="page-list">
              {activeFile.pages.map((page) => (
                <button
                  className={page.id === activePageId ? "page-row active" : "page-row"}
                  key={page.id}
                  type="button"
                  onClick={() => setActivePage(page.id)}
                >
                  <span>{page.name}</span>
                  <small>{page.layers.filter((layer) => layer.type === "frame").length}</small>
                </button>
              ))}
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