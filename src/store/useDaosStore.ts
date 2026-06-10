import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { foundationTokens, seedProject } from "../data/seed";
import type {
  AlignMode,
  CanvasTool,
  DaosProject,
  DesignFile,
  DesignPage,
  DesignToken,
  DistributionAxis,
  EditorMode,
  Language,
  LayerNode
} from "../types";
import {
  buildLayerMap,
  getLayerBounds,
  getRelativePositionFromAbsolute,
  getRootLayerIds
} from "../utils/layers";
import type { NofidaFileSnapshot } from "../utils/nofidaFile";

type LayerInput = Omit<LayerNode, "id" | "visible" | "locked"> &
  Partial<Pick<LayerNode, "id" | "visible" | "locked">>;

type MoveDirection = "forward" | "backward";
type TokenApplyTarget = "fill" | "stroke" | "radius" | "fontSize";

interface SelectionState {
  selectedLayerId?: string;
  selectedLayerIds: string[];
}

interface DaosState {
  language: Language;
  mode: EditorMode;
  activeTool: CanvasTool;
  project: DaosProject;
  activeFileId: string;
  activePageId: string;
  selectedLayerId?: string;
  selectedLayerIds: string[];
  zoom: number;
  setLanguage: (language: Language) => void;
  setMode: (mode: EditorMode) => void;
  setActiveTool: (tool: CanvasTool) => void;
  resetLocalEditorState: () => void;
  setActivePage: (pageId: string) => void;
  importSnapshot: (snapshot: NofidaFileSnapshot) => void;
  installFoundationTokens: () => void;
  updateTokenValue: (tokenId: string, value: string) => void;
  applyTokenToSelectedLayer: (tokenId: string, target: TokenApplyTarget) => void;
  createPage: () => void;
  renamePage: (pageId: string, name: string) => void;
  duplicatePage: (pageId: string) => void;
  deletePage: (pageId: string) => void;
  selectSingleLayer: (layerId?: string) => void;
  toggleLayerSelection: (layerId: string) => void;
  selectLayers: (layerIds: string[]) => void;
  clearSelection: () => void;
  selectLayer: (layerId?: string) => void;
  setZoom: (zoom: number) => void;
  createLayer: (layer: LayerInput) => void;
  updateLayer: (layerId: string, patch: Partial<LayerNode>) => void;
  updateSelectedLayer: (patch: Partial<LayerNode>) => void;
  deleteSelectedLayers: () => void;
  deleteSelectedLayer: () => void;
  duplicateSelectedLayers: () => void;
  duplicateSelectedLayer: () => void;
  moveSelectedLayers: (deltaX: number, deltaY: number) => void;
  moveSelectedLayer: (direction: MoveDirection) => void;
  alignSelectedLayers: (mode: AlignMode) => void;
  distributeSelectedLayers: (axis: DistributionAxis) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
}

const firstFile = seedProject.files[0];
const firstPage = firstFile.pages[0];
const defaultSelection = makeSelectionState(firstPage, "frame-onboarding-full", [
  "frame-onboarding-full"
]);

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptySelection(): SelectionState {
  return {
    selectedLayerId: undefined,
    selectedLayerIds: []
  };
}

function numberFromTokenValue(value: string): number | undefined {
  const numericValue = Number.parseFloat(value.replace("px", "").trim());
  return Number.isNaN(numericValue) ? undefined : numericValue;
}

function mergeFoundationTokens(existingTokens: DesignToken[]): DesignToken[] {
  const existingById = new Map(existingTokens.map((token) => [token.id, token]));
  const foundationIds = new Set(foundationTokens.map((token) => token.id));

  const mergedFoundation = foundationTokens.map((token) => {
    const existing = existingById.get(token.id);

    if (!existing) {
      return token;
    }

    return {
      ...token,
      value: existing.value,
      description: existing.description ?? token.description
    };
  });

  const customTokens = existingTokens.filter((token) => !foundationIds.has(token.id));
  return [...mergedFoundation, ...customTokens];
}

function getLayerAndDescendantIds(
  layers: LayerNode[],
  layerId: string
): Set<string> {
  const ids = new Set<string>([layerId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const layer of layers) {
      if (layer.parentId && ids.has(layer.parentId) && !ids.has(layer.id)) {
        ids.add(layer.id);
        changed = true;
      }
    }
  }

  return ids;
}

function cloneLayers(layers: LayerNode[]): LayerNode[] {
  const idMap = new Map<string, string>();

  for (const layer of layers) {
    idMap.set(layer.id, makeId(layer.type));
  }

  return layers.map((layer) => ({
    ...layer,
    id: idMap.get(layer.id) ?? makeId(layer.type),
    parentId: layer.parentId ? idMap.get(layer.parentId) : undefined,
    locked: false,
    visible: true
  }));
}

function updateActiveFile(
  project: DaosProject,
  activeFileId: string,
  updater: (file: DesignFile) => DesignFile
): DaosProject {
  return {
    ...project,
    files: project.files.map((file) =>
      file.id === activeFileId ? updater(file) : file
    )
  };
}

function updateActivePage(
  project: DaosProject,
  activeFileId: string,
  activePageId: string,
  updater: (page: DesignPage) => DesignPage
): DaosProject {
  return updateActiveFile(project, activeFileId, (file) => ({
    ...file,
    pages: file.pages.map((page) =>
      page.id === activePageId ? updater(page) : page
    )
  }));
}

function updateLayerInProject(
  project: DaosProject,
  activeFileId: string,
  activePageId: string,
  layerId: string,
  patch: Partial<LayerNode>
): DaosProject {
  return updateActivePage(project, activeFileId, activePageId, (page) => ({
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === layerId ? { ...layer, ...patch } : layer
    )
  }));
}

function makeSelectionState(
  page: DesignPage,
  selectedLayerId?: string,
  selectedLayerIds?: string[]
): SelectionState {
  const pageLayerIds = new Set(page.layers.map((layer) => layer.id));
  const normalizedIds = Array.from(
    new Set(
      [
        ...(selectedLayerIds ?? []),
        ...(selectedLayerId ? [selectedLayerId] : [])
      ].filter((layerId): layerId is string => typeof layerId === "string")
    )
  ).filter((layerId) => pageLayerIds.has(layerId));

  if (normalizedIds.length === 0) {
    return emptySelection();
  }

  return {
    selectedLayerId:
      selectedLayerId && normalizedIds.includes(selectedLayerId)
        ? selectedLayerId
        : normalizedIds[normalizedIds.length - 1],
    selectedLayerIds: normalizedIds
  };
}

function applySelection(
  page: DesignPage,
  layerIds: string[],
  primaryLayerId?: string
): SelectionState {
  return makeSelectionState(
    page,
    primaryLayerId ?? layerIds[layerIds.length - 1],
    layerIds
  );
}

function getSelectedRootLayers(
  page: DesignPage,
  selectedLayerIds: string[]
): LayerNode[] {
  const layerMap = buildLayerMap(page.layers);

  return getRootLayerIds(page.layers, selectedLayerIds)
    .map((layerId) => layerMap.get(layerId))
    .filter((layer): layer is LayerNode => Boolean(layer));
}

function getMovableRootLayers(
  page: DesignPage,
  selectedLayerIds: string[]
): LayerNode[] {
  const layerMap = buildLayerMap(page.layers);
  const unlockedIds = selectedLayerIds.filter((layerId) => {
    const layer = layerMap.get(layerId);
    return layer?.locked === false;
  });

  return getRootLayerIds(page.layers, unlockedIds)
    .map((layerId) => layerMap.get(layerId))
    .filter((layer): layer is LayerNode => Boolean(layer));
}

function updateLayers(
  page: DesignPage,
  patches: Map<string, Partial<LayerNode>>
): DesignPage {
  if (patches.size === 0) {
    return page;
  }

  return {
    ...page,
    layers: page.layers.map((layer) =>
      patches.has(layer.id) ? { ...layer, ...patches.get(layer.id) } : layer
    )
  };
}

export const useDaosStore = create<DaosState>()(
  persist(
    (set, get) => ({
      language: "ru",
      mode: "design",
      activeTool: "select",
      project: seedProject,
      activeFileId: firstFile.id,
      activePageId: firstPage.id,
      selectedLayerId: defaultSelection.selectedLayerId,
      selectedLayerIds: defaultSelection.selectedLayerIds,
      zoom: 82,

      setLanguage: (language) => set({ language }),
      setMode: (mode) => set({ mode }),
      setActiveTool: (activeTool) => set({ activeTool }),
      resetLocalEditorState: () => {
        window.localStorage.removeItem("nofida-editor-state-v1");
        window.location.reload();
      },

      setActivePage: (pageId) =>
        set((state) => {
          const file = getActiveFile(state);
          const nextPage = file.pages.find((page) => page.id === pageId) ?? file.pages[0];

          return {
            activePageId: nextPage.id,
            ...emptySelection()
          };
        }),

      importSnapshot: (snapshot) =>
        set(() => {
          const firstImportedFile = snapshot.project.files[0];
          const importedFile =
            snapshot.project.files.find((file) => file.id === snapshot.activeFileId) ??
            firstImportedFile;

          const firstImportedPage = importedFile.pages[0];
          const importedPage =
            importedFile.pages.find((page) => page.id === snapshot.activePageId) ??
            firstImportedPage;

          const selection = makeSelectionState(
            importedPage,
            snapshot.selectedLayerId,
            snapshot.selectedLayerIds
          );

          return {
            language: snapshot.language,
            mode: snapshot.mode,
            activeTool: "select",
            project: {
              ...snapshot.project,
              tokens: mergeFoundationTokens(snapshot.project.tokens ?? [])
            },
            activeFileId: importedFile.id,
            activePageId: importedPage.id,
            ...selection,
            zoom: snapshot.zoom
          };
        }),

      installFoundationTokens: () =>
        set((state) => ({
          project: {
            ...state.project,
            tokens: mergeFoundationTokens(state.project.tokens ?? [])
          }
        })),

      updateTokenValue: (tokenId, value) =>
        set((state) => ({
          project: {
            ...state.project,
            tokens: state.project.tokens.map((token) =>
              token.id === tokenId ? { ...token, value } : token
            )
          }
        })),

      applyTokenToSelectedLayer: (tokenId, target) =>
        set((state) => {
          const token = state.project.tokens.find((item) => item.id === tokenId);
          const page = getActivePage(state);
          const editableLayers = getSelectedLayers(state).filter((layer) => !layer.locked);

          if (!token || editableLayers.length === 0) {
            return state;
          }

          const patches = new Map<string, Partial<LayerNode>>();

          for (const layer of editableLayers) {
            const patch: Partial<LayerNode> = {};

            if (target === "fill") {
              patch.fill = token.value;
            }

            if (target === "stroke") {
              patch.stroke = token.value;
            }

            if (target === "radius") {
              const radius = numberFromTokenValue(token.value);
              if (radius === undefined) {
                continue;
              }

              patch.radius = radius;
            }

            if (target === "fontSize") {
              if (layer.type !== "text" && layer.type !== "button") {
                continue;
              }

              const fontSize = numberFromTokenValue(token.value);
              if (fontSize === undefined) {
                continue;
              }

              patch.fontSize = fontSize;
            }

            if (Object.keys(patch).length > 0) {
              patches.set(layer.id, patch);
            }
          }

          if (patches.size === 0) {
            return state;
          }

          const nextPage = updateLayers(page, patches);

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              () => nextPage
            )
          };
        }),

      createPage: () =>
        set((state) => {
          const activeFile = getActiveFile(state);
          const newPage: DesignPage = {
            id: makeId("page"),
            name: `Page ${activeFile.pages.length + 1}`,
            layers: []
          };

          return {
            activePageId: newPage.id,
            ...emptySelection(),
            project: updateActiveFile(state.project, state.activeFileId, (file) => ({
              ...file,
              pages: [...file.pages, newPage]
            }))
          };
        }),

      renamePage: (pageId, name) =>
        set((state) => ({
          project: updateActiveFile(state.project, state.activeFileId, (file) => ({
            ...file,
            pages: file.pages.map((page) =>
              page.id === pageId
                ? { ...page, name: name.trim().length > 0 ? name : page.name }
                : page
            )
          }))
        })),

      duplicatePage: (pageId) =>
        set((state) => {
          const activeFile = getActiveFile(state);
          const pageToDuplicate = activeFile.pages.find((page) => page.id === pageId);

          if (!pageToDuplicate) {
            return state;
          }

          const duplicatedPage: DesignPage = {
            id: makeId("page"),
            name: `${pageToDuplicate.name} copy`,
            layers: cloneLayers(pageToDuplicate.layers)
          };

          const pageIndex = activeFile.pages.findIndex((page) => page.id === pageId);

          return {
            activePageId: duplicatedPage.id,
            ...emptySelection(),
            project: updateActiveFile(state.project, state.activeFileId, (file) => {
              const pages = [...file.pages];
              pages.splice(pageIndex + 1, 0, duplicatedPage);
              return { ...file, pages };
            })
          };
        }),

      deletePage: (pageId) =>
        set((state) => {
          const activeFile = getActiveFile(state);
          const pageIndex = activeFile.pages.findIndex((page) => page.id === pageId);

          if (pageIndex < 0 || activeFile.pages.length <= 1) {
            return state;
          }

          const nextPages = activeFile.pages.filter((page) => page.id !== pageId);

          if (state.activePageId === pageId) {
            const fallbackIndex = Math.min(pageIndex, nextPages.length - 1);
            const fallbackPage = nextPages[fallbackIndex];

            return {
              activePageId: fallbackPage.id,
              ...emptySelection(),
              project: updateActiveFile(state.project, state.activeFileId, (file) => ({
                ...file,
                pages: nextPages
              }))
            };
          }

          return {
            project: updateActiveFile(state.project, state.activeFileId, (file) => ({
              ...file,
              pages: nextPages
            }))
          };
        }),

      selectSingleLayer: (layerId) =>
        set((state) => {
          const selection = layerId
            ? applySelection(getActivePage(state), [layerId], layerId)
            : emptySelection();

          return selection;
        }),

      toggleLayerSelection: (layerId) =>
        set((state) => {
          const page = getActivePage(state);
          const selection = makeSelectionState(
            page,
            state.selectedLayerId,
            state.selectedLayerIds
          );

          if (selection.selectedLayerIds.includes(layerId)) {
            const nextIds = selection.selectedLayerIds.filter((id) => id !== layerId);
            return nextIds.length > 0
              ? applySelection(page, nextIds, nextIds[nextIds.length - 1])
              : emptySelection();
          }

          return applySelection(page, [...selection.selectedLayerIds, layerId], layerId);
        }),

      selectLayers: (layerIds) =>
        set((state) => applySelection(getActivePage(state), layerIds)),

      clearSelection: () => set(emptySelection()),

      selectLayer: (layerId) => get().selectSingleLayer(layerId),

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
            activeTool: "select",
            selectedLayerId: newLayer.id,
            selectedLayerIds: [newLayer.id],
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              (page) => ({
                ...page,
                layers: [...page.layers, newLayer]
              })
            )
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
      },

      deleteSelectedLayers: () =>
        set((state) => {
          const page = getActivePage(state);
          const selectedRoots = getSelectedRootLayers(page, state.selectedLayerIds);

          if (selectedRoots.length === 0) {
            return {
              ...emptySelection()
            };
          }

          const idsToRemove = new Set<string>();

          for (const layer of selectedRoots) {
            const descendantIds = getLayerAndDescendantIds(page.layers, layer.id);
            descendantIds.forEach((id) => idsToRemove.add(id));
          }

          return {
            ...emptySelection(),
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              (currentPage) => ({
                ...currentPage,
                layers: currentPage.layers.filter((layer) => !idsToRemove.has(layer.id))
              })
            )
          };
        }),

      deleteSelectedLayer: () => get().deleteSelectedLayers(),

      duplicateSelectedLayers: () =>
        set((state) => {
          const page = getActivePage(state);
          const selectedRoots = getSelectedRootLayers(page, state.selectedLayerIds);

          if (selectedRoots.length === 0) {
            return state;
          }

          const duplicatedRootIds: string[] = [];
          const duplicatedLayers: LayerNode[] = [];

          for (const root of selectedRoots) {
            const idsToDuplicate = getLayerAndDescendantIds(page.layers, root.id);
            const idMap = new Map<string, string>();

            for (const layer of page.layers) {
              if (idsToDuplicate.has(layer.id)) {
                idMap.set(layer.id, makeId(layer.type));
              }
            }

            duplicatedRootIds.push(idMap.get(root.id) ?? makeId(root.type));

            duplicatedLayers.push(
              ...page.layers
                .filter((layer) => idsToDuplicate.has(layer.id))
                .map((layer) => {
                  const isRoot = layer.id === root.id;
                  const duplicatedParentId =
                    layer.parentId && idsToDuplicate.has(layer.parentId)
                      ? idMap.get(layer.parentId)
                      : layer.parentId;

                  return {
                    ...layer,
                    id: idMap.get(layer.id) ?? makeId(layer.type),
                    parentId: duplicatedParentId,
                    name: isRoot ? `${layer.name} copy` : layer.name,
                    x: isRoot ? layer.x + 24 : layer.x,
                    y: isRoot ? layer.y + 24 : layer.y,
                    locked: false,
                    visible: true
                  };
                })
            );
          }

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              (currentPage) => ({
                ...currentPage,
                layers: [...currentPage.layers, ...duplicatedLayers]
              })
            ),
            selectedLayerId: duplicatedRootIds[duplicatedRootIds.length - 1],
            selectedLayerIds: duplicatedRootIds
          };
        }),

      duplicateSelectedLayer: () => get().duplicateSelectedLayers(),

      moveSelectedLayers: (deltaX, deltaY) =>
        set((state) => {
          if (deltaX === 0 && deltaY === 0) {
            return state;
          }

          const page = getActivePage(state);
          const movableRoots = getMovableRootLayers(page, state.selectedLayerIds);

          if (movableRoots.length === 0) {
            return state;
          }

          const patches = new Map<string, Partial<LayerNode>>();

          for (const layer of movableRoots) {
            patches.set(layer.id, {
              x: Math.round(layer.x + deltaX),
              y: Math.round(layer.y + deltaY)
            });
          }

          const nextPage = updateLayers(page, patches);

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              () => nextPage
            )
          };
        }),

      moveSelectedLayer: (direction) =>
        set((state) => {
          if (!state.selectedLayerId) {
            return state;
          }

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              (page) => {
                const index = page.layers.findIndex(
                  (layer) => layer.id === state.selectedLayerId
                );

                if (index < 0) {
                  return page;
                }

                const nextIndex =
                  direction === "forward"
                    ? Math.min(page.layers.length - 1, index + 1)
                    : Math.max(0, index - 1);

                if (nextIndex === index) {
                  return page;
                }

                const layers = [...page.layers];
                const current = layers[index];
                const target = layers[nextIndex];
                layers[index] = target;
                layers[nextIndex] = current;

                return { ...page, layers };
              }
            )
          };
        }),

      alignSelectedLayers: (mode) =>
        set((state) => {
          const page = getActivePage(state);
          const layerMap = buildLayerMap(page.layers);
          const movableRoots = getMovableRootLayers(page, state.selectedLayerIds);

          if (movableRoots.length < 2) {
            return state;
          }

          const layersWithBounds = movableRoots.map((layer) => ({
            layer,
            bounds: getLayerBounds(layer, layerMap)
          }));

          const minLeft = Math.min(...layersWithBounds.map((item) => item.bounds.left));
          const maxRight = Math.max(...layersWithBounds.map((item) => item.bounds.right));
          const minTop = Math.min(...layersWithBounds.map((item) => item.bounds.top));
          const maxBottom = Math.max(...layersWithBounds.map((item) => item.bounds.bottom));
          const centerX = (minLeft + maxRight) / 2;
          const centerY = (minTop + maxBottom) / 2;
          const patches = new Map<string, Partial<LayerNode>>();

          for (const item of layersWithBounds) {
            let nextAbsoluteX = item.bounds.left;
            let nextAbsoluteY = item.bounds.top;

            if (mode === "left") nextAbsoluteX = minLeft;
            if (mode === "centerX") nextAbsoluteX = centerX - item.layer.width / 2;
            if (mode === "right") nextAbsoluteX = maxRight - item.layer.width;
            if (mode === "top") nextAbsoluteY = minTop;
            if (mode === "centerY") nextAbsoluteY = centerY - item.layer.height / 2;
            if (mode === "bottom") nextAbsoluteY = maxBottom - item.layer.height;

            const relativePosition = getRelativePositionFromAbsolute(
              item.layer,
              layerMap,
              nextAbsoluteX,
              nextAbsoluteY
            );

            patches.set(item.layer.id, {
              x: Math.round(relativePosition.x),
              y: Math.round(relativePosition.y)
            });
          }

          const nextPage = updateLayers(page, patches);

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              () => nextPage
            )
          };
        }),

      distributeSelectedLayers: (axis) =>
        set((state) => {
          const page = getActivePage(state);
          const layerMap = buildLayerMap(page.layers);
          const movableRoots = getMovableRootLayers(page, state.selectedLayerIds);

          if (movableRoots.length < 3) {
            return state;
          }

          const ordered = movableRoots
            .map((layer) => ({
              layer,
              bounds: getLayerBounds(layer, layerMap)
            }))
            .sort((left, right) =>
              axis === "horizontal"
                ? left.bounds.left - right.bounds.left
                : left.bounds.top - right.bounds.top
            );

          const first = ordered[0];
          const last = ordered[ordered.length - 1];
          const totalSize = ordered.reduce(
            (sum, item) =>
              sum + (axis === "horizontal" ? item.layer.width : item.layer.height),
            0
          );
          const span =
            axis === "horizontal"
              ? last.bounds.right - first.bounds.left
              : last.bounds.bottom - first.bounds.top;
          const gap = (span - totalSize) / (ordered.length - 1);
          const patches = new Map<string, Partial<LayerNode>>();

          let cursor =
            axis === "horizontal"
              ? first.bounds.left + first.layer.width + gap
              : first.bounds.top + first.layer.height + gap;

          for (let index = 1; index < ordered.length - 1; index += 1) {
            const item = ordered[index];
            const nextAbsoluteX = axis === "horizontal" ? cursor : item.bounds.left;
            const nextAbsoluteY = axis === "vertical" ? cursor : item.bounds.top;
            const relativePosition = getRelativePositionFromAbsolute(
              item.layer,
              layerMap,
              nextAbsoluteX,
              nextAbsoluteY
            );

            patches.set(item.layer.id, {
              x: Math.round(relativePosition.x),
              y: Math.round(relativePosition.y)
            });

            cursor +=
              (axis === "horizontal" ? item.layer.width : item.layer.height) + gap;
          }

          const nextPage = updateLayers(page, patches);

          return {
            project: updateActivePage(
              state.project,
              state.activeFileId,
              state.activePageId,
              () => nextPage
            )
          };
        }),

      toggleLayerVisibility: (layerId) =>
        set((state) => {
          const page = getActivePage(state);
          const layer = page.layers.find((item) => item.id === layerId);

          if (!layer) {
            return state;
          }

          return {
            project: updateLayerInProject(
              state.project,
              state.activeFileId,
              state.activePageId,
              layerId,
              {
                visible: !layer.visible
              }
            )
          };
        }),

      toggleLayerLock: (layerId) =>
        set((state) => {
          const page = getActivePage(state);
          const layer = page.layers.find((item) => item.id === layerId);

          if (!layer) {
            return state;
          }

          return {
            project: updateLayerInProject(
              state.project,
              state.activeFileId,
              state.activePageId,
              layerId,
              {
                locked: !layer.locked
              }
            )
          };
        })
    }),
    {
      name: "nofida-editor-state-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        mode: state.mode,
        project: state.project,
        activeFileId: state.activeFileId,
        activePageId: state.activePageId,
        selectedLayerId: state.selectedLayerId,
        selectedLayerIds: state.selectedLayerIds,
        zoom: state.zoom
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DaosState> | undefined;
        const mergedState = {
          ...currentState,
          ...persisted,
          activeTool: "select"
        } as DaosState;
        const selection = makeSelectionState(
          getActivePage(mergedState),
          mergedState.selectedLayerId,
          mergedState.selectedLayerIds
        );

        return {
          ...mergedState,
          ...selection
        };
      }
    }
  )
);

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

export function getSelectedLayers(state: DaosState): LayerNode[] {
  const selectedSet = new Set(state.selectedLayerIds);
  return getActivePage(state).layers.filter((layer) => selectedSet.has(layer.id));
}
