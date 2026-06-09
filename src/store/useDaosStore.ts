import { create } from "zustand";
import { seedProject } from "../data/seed";
import type {
  CanvasTool,
  DaosProject,
  DesignFile,
  DesignPage,
  EditorMode,
  Language,
  LayerNode
} from "../types";

type LayerInput = Omit<LayerNode, "id" | "visible" | "locked"> &
  Partial<Pick<LayerNode, "id" | "visible" | "locked">>;

interface DaosState {
  language: Language;
  mode: EditorMode;
  activeTool: CanvasTool;
  project: DaosProject;
  activeFileId: string;
  activePageId: string;
  selectedLayerId?: string;
  zoom: number;
  setLanguage: (language: Language) => void;
  setMode: (mode: EditorMode) => void;
  setActiveTool: (tool: CanvasTool) => void;
  setActivePage: (pageId: string) => void;
  selectLayer: (layerId?: string) => void;
  setZoom: (zoom: number) => void;
  createLayer: (layer: LayerInput) => void;
  updateLayer: (layerId: string, patch: Partial<LayerNode>) => void;
  updateSelectedLayer: (patch: Partial<LayerNode>) => void;
}

const firstFile = seedProject.files[0];
const firstPage = firstFile.pages[0];

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function updateLayerInProject(
  project: DaosProject,
  activeFileId: string,
  activePageId: string,
  layerId: string,
  patch: Partial<LayerNode>
): DaosProject {
  return {
    ...project,
    files: project.files.map((file) =>
      file.id === activeFileId
        ? {
            ...file,
            pages: file.pages.map((page) =>
              page.id === activePageId
                ? {
                    ...page,
                    layers: page.layers.map((layer) =>
                      layer.id === layerId ? { ...layer, ...patch } : layer
                    )
                  }
                : page
            )
          }
        : file
    )
  };
}

export const useDaosStore = create<DaosState>((set, get) => ({
  language: "ru",
  mode: "design",
  activeTool: "select",
  project: seedProject,
  activeFileId: firstFile.id,
  activePageId: firstPage.id,
  selectedLayerId: "frame-mobile-home",
  zoom: 82,

  setLanguage: (language) => set({ language }),

  setMode: (mode) => set({ mode }),

  setActiveTool: (activeTool) => set({ activeTool }),

  setActivePage: (pageId) =>
    set({
      activePageId: pageId,
      selectedLayerId: undefined
    }),

  selectLayer: (layerId) =>
    set({
      selectedLayerId: layerId
    }),

  setZoom: (zoom) =>
    set({
      zoom: Math.min(200, Math.max(25, zoom))
    }),

  createLayer: (layer) =>
    set((state) => {
      const newLayer: LayerNode = {
        ...layer,
        id: layer.id ?? makeId(layer.type),
        visible: layer.visible ?? true,
        locked: layer.locked ?? false,
        opacity: layer.opacity ?? 1
      };

      return {
        selectedLayerId: newLayer.id,
        project: {
          ...state.project,
          files: state.project.files.map((file) =>
            file.id === state.activeFileId
              ? {
                  ...file,
                  pages: file.pages.map((page) =>
                    page.id === state.activePageId
                      ? {
                          ...page,
                          layers: [...page.layers, newLayer]
                        }
                      : page
                  )
                }
              : file
          )
        }
      };
    }),

  updateLayer: (layerId, patch) =>
    set((state) => ({
      project: updateLayerInProject(
        state.project,
        state.activeFileId,
        state.activePageId,
        layerId,
        patch
      )
    })),

  updateSelectedLayer: (patch) => {
    const selectedLayerId = get().selectedLayerId;

    if (!selectedLayerId) {
      return;
    }

    get().updateLayer(selectedLayerId, patch);
  }
}));

export function getActiveFile(state: DaosState): DesignFile {
  const file = state.project.files.find((item) => item.id === state.activeFileId);
  return file ?? state.project.files[0];
}

export function getActivePage(state: DaosState): DesignPage {
  const file = getActiveFile(state);
  const page = file.pages.find((item) => item.id === state.activePageId);
  return page ?? file.pages[0];
}

export function getSelectedLayer(state: DaosState): LayerNode | undefined {
  return getActivePage(state).layers.find(
    (layer) => layer.id === state.selectedLayerId
  );
}