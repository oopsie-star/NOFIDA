import {
  Frame,
  MousePointer2,
  Move,
  Sparkles,
  Square,
  Type
} from "lucide-react";
import type { PointerEvent } from "react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { tr } from "../../i18n";
import { getActivePage, useDaosStore } from "../../store/useDaosStore";
import type { CanvasTool, LayerNode } from "../../types";
import {
  buildLayerMap,
  getLayerBounds,
  getRootLayerIds,
  intersectsRect,
  normalizeSelectionRect
} from "../../utils/layers";

const BOARD_WIDTH = 12000;
const BOARD_HEIGHT = 8000;

interface CanvasPoint {
  x: number;
  y: number;
}

type Interaction =
  | {
      kind: "drag";
      startX: number;
      startY: number;
      layers: Array<{
        id: string;
        initialX: number;
        initialY: number;
      }>;
    }
  | {
      kind: "resize";
      layerId: string;
      startX: number;
      startY: number;
      initialWidth: number;
      initialHeight: number;
    }
  | {
      kind: "pan";
      startClientX: number;
      startClientY: number;
      startScrollLeft: number;
      startScrollTop: number;
    }
  | {
      kind: "marquee";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      additive: boolean;
      baseSelectedIds: string[];
    };

const tools: Array<{
  id: CanvasTool;
  icon: typeof MousePointer2;
  labelKey: string;
}> = [
  { id: "select", icon: MousePointer2, labelKey: "tool.select" },
  { id: "frame", icon: Frame, labelKey: "tool.frame" },
  { id: "rectangle", icon: Square, labelKey: "tool.rectangle" },
  { id: "text", icon: Type, labelKey: "tool.text" },
  { id: "button", icon: MousePointer2, labelKey: "tool.button" }
];

function round(value: number): number {
  return Math.round(value);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction | undefined>();
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // After a zoom change, scroll so the cursor stays over the same board point.
  const pendingScrollRef = useRef<
    { scrollLeft: number; scrollTop: number } | undefined
  >(undefined);

  const language = useDaosStore((state) => state.language);
  const activePage = useDaosStore(getActivePage);
  const selectedLayerId = useDaosStore((state) => state.selectedLayerId);
  const selectedLayerIds = useDaosStore((state) => state.selectedLayerIds);
  const selectSingleLayer = useDaosStore((state) => state.selectSingleLayer);
  const toggleLayerSelection = useDaosStore((state) => state.toggleLayerSelection);
  const selectLayers = useDaosStore((state) => state.selectLayers);
  const clearSelection = useDaosStore((state) => state.clearSelection);
  const zoom = useDaosStore((state) => state.zoom);
  const setZoom = useDaosStore((state) => state.setZoom);
  const activeTool = useDaosStore((state) => state.activeTool);
  const setActiveTool = useDaosStore((state) => state.setActiveTool);
  const createLayer = useDaosStore((state) => state.createLayer);
  const updateLayer = useDaosStore((state) => state.updateLayer);
  const deleteSelectedLayers = useDaosStore((state) => state.deleteSelectedLayers);
  const duplicateSelectedLayers = useDaosStore(
    (state) => state.duplicateSelectedLayers
  );
  const moveSelectedLayer = useDaosStore((state) => state.moveSelectedLayer);
  const groupSelectedLayers = useDaosStore((state) => state.groupSelectedLayers);
  const ungroupSelectedLayers = useDaosStore((state) => state.ungroupSelectedLayers);

  // Keep a ref so wheel/keyboard handlers see the latest zoom without re-subscribing.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const layerMap = useMemo(() => buildLayerMap(activePage.layers), [activePage.layers]);
  const selectedLayerSet = useMemo(
    () => new Set(selectedLayerIds),
    [selectedLayerIds]
  );
  const frames = activePage.layers.filter(
    (layer) => layer.type === "frame" && layer.visible
  );
  const rootLooseLayers = activePage.layers.filter(
    (layer) => !layer.parentId && layer.type !== "frame" && layer.visible
  );

  const marqueeRect =
    interaction?.kind === "marquee"
      ? normalizeSelectionRect(
          interaction.startX,
          interaction.startY,
          interaction.currentX,
          interaction.currentY
        )
      : undefined;

  // Apply the pending scroll correction after React re-renders with the new zoom.
  useEffect(() => {
    if (pendingScrollRef.current && viewportRef.current) {
      const { scrollLeft, scrollTop } = pendingScrollRef.current;
      viewportRef.current.scrollLeft = Math.max(0, scrollLeft);
      viewportRef.current.scrollTop = Math.max(0, scrollTop);
      pendingScrollRef.current = undefined;
    }
  }, [zoom]);

  // Ctrl/Cmd + wheel zoom. Must be non-passive to allow preventDefault.
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();

      const currentZoom = zoomRef.current;
      const delta = event.deltaY > 0 ? -10 : 10;
      const newZoom = Math.min(200, Math.max(25, currentZoom + delta));

      if (newZoom === currentZoom) {
        return;
      }

      const viewportElement = viewportRef.current;

      if (!viewportElement) {
        return;
      }

      const rect = viewportElement.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const oldRatio = currentZoom / 100;
      const newRatio = newZoom / 100;
      const canvasX = (viewportElement.scrollLeft + cursorX) / oldRatio;
      const canvasY = (viewportElement.scrollTop + cursorY) / oldRatio;

      pendingScrollRef.current = {
        scrollLeft: canvasX * newRatio - cursorX,
        scrollTop: canvasY * newRatio - cursorY
      };

      setZoom(newZoom);
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [setZoom]);

  // Keyboard shortcuts + Space pan.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === " " && !isEditableTarget(event.target)) {
        event.preventDefault();
        setIsSpaceDown(true);
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasCommand = event.ctrlKey || event.metaKey;

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedLayerIds.length > 0
      ) {
        event.preventDefault();
        deleteSelectedLayers();
        return;
      }

      if (hasCommand && key === "d") {
        event.preventDefault();
        duplicateSelectedLayers();
        return;
      }

      if (hasCommand && event.key === "]") {
        event.preventDefault();
        moveSelectedLayer("forward");
        return;
      }

      if (hasCommand && event.key === "[") {
        event.preventDefault();
        moveSelectedLayer("backward");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveTool("select");
        clearSelection();
        return;
      }

      if (hasCommand && key === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          ungroupSelectedLayers();
        } else {
          groupSelectedLayers();
        }
        return;
      }

      if (hasCommand || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "v") setActiveTool("select");
      if (key === "f") setActiveTool("frame");
      if (key === "r") setActiveTool("rectangle");
      if (key === "t") setActiveTool("text");
      if (key === "b") setActiveTool("button");
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === " ") {
        setIsSpaceDown(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    clearSelection,
    deleteSelectedLayers,
    duplicateSelectedLayers,
    groupSelectedLayers,
    moveSelectedLayer,
    selectedLayerIds.length,
    setActiveTool,
    ungroupSelectedLayers
  ]);

  function getCanvasPoint(event: PointerEvent): CanvasPoint | undefined {
    const viewport = viewportRef.current;

    if (!viewport) {
      return undefined;
    }

    const rect = viewport.getBoundingClientRect();
    const zoomRatio = zoom / 100;

    return {
      x: (event.clientX - rect.left + viewport.scrollLeft) / zoomRatio,
      y: (event.clientY - rect.top + viewport.scrollTop) / zoomRatio
    };
  }

  function isLayerVisibleOnCanvas(layer: LayerNode): boolean {
    if (!layer.visible) {
      return false;
    }

    let parentId = layer.parentId;
    const visited = new Set<string>();

    while (parentId) {
      if (visited.has(parentId)) {
        break;
      }

      visited.add(parentId);

      const parent = layerMap.get(parentId);
      if (!parent) {
        break;
      }

      if (!parent.visible) {
        return false;
      }

      parentId = parent.parentId;
    }

    return true;
  }

  function getMovableRoots(layerIds: string[]): LayerNode[] {
    const unlockedIds = layerIds.filter((layerId) => {
      const layer = layerMap.get(layerId);
      return layer?.locked === false;
    });

    return getRootLayerIds(activePage.layers, unlockedIds)
      .map((layerId) => layerMap.get(layerId))
      .filter((layer): layer is LayerNode => Boolean(layer));
  }

  function getMarqueeSelection(rect: ReturnType<typeof normalizeSelectionRect>): string[] {
    return activePage.layers
      .filter((layer) => isLayerVisibleOnCanvas(layer) && !layer.locked)
      .filter((layer) => intersectsRect(getLayerBounds(layer, layerMap), rect))
      .map((layer) => layer.id);
  }

  function findFrameAtPoint(point: CanvasPoint): LayerNode | undefined {
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      const frame = frames[index];

      if (
        point.x >= frame.x &&
        point.x <= frame.x + frame.width &&
        point.y >= frame.y &&
        point.y <= frame.y + frame.height
      ) {
        return frame;
      }
    }

    return undefined;
  }

  function createLayerAtPoint(point: CanvasPoint) {
    if (activeTool === "select") {
      return;
    }

    if (activeTool === "frame") {
      createLayer({
        name: "Frame",
        type: "frame",
        x: round(point.x),
        y: round(point.y),
        width: 390,
        height: 844,
        radius: 28,
        fill: "#ffffff",
        stroke: "#d8deea"
      });

      return;
    }

    const parentFrame = findFrameAtPoint(point);
    const x = parentFrame ? point.x - parentFrame.x : point.x;
    const y = parentFrame ? point.y - parentFrame.y : point.y;

    if (activeTool === "rectangle") {
      createLayer({
        name: "Rectangle",
        type: "rectangle",
        parentId: parentFrame?.id,
        x: round(x),
        y: round(y),
        width: 180,
        height: 112,
        radius: 18,
        fill: "#f8fafc",
        stroke: "#dbe2ee"
      });

      return;
    }

    if (activeTool === "text") {
      createLayer({
        name: "Text",
        type: "text",
        parentId: parentFrame?.id,
        x: round(x),
        y: round(y),
        width: 240,
        height: 52,
        text: "New text layer",
        fontSize: 18,
        fontWeight: 700,
        fill: "#111827"
      });

      return;
    }

    if (activeTool === "button") {
      createLayer({
        name: "Button",
        type: "button",
        parentId: parentFrame?.id,
        x: round(x),
        y: round(y),
        width: 168,
        height: 48,
        radius: 15,
        text: "Button",
        fontSize: 15,
        fontWeight: 700,
        fill: "#2563eb"
      });
    }
  }

  function startDrag(event: PointerEvent, layer: LayerNode) {
    // When space is held, let the event bubble so the canvas can start a pan.
    if (event.button !== 0 || isSpaceDown || activeTool !== "select") {
      return;
    }

    event.stopPropagation();

    if (event.shiftKey) {
      toggleLayerSelection(layer.id);
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    const isSelected = selectedLayerSet.has(layer.id);

    if (layer.locked) {
      selectSingleLayer(layer.id);
      return;
    }

    if (!isSelected) {
      selectSingleLayer(layer.id);
    } else if (selectedLayerId !== layer.id) {
      selectLayers([...selectedLayerIds.filter((id) => id !== layer.id), layer.id]);
    }

    const dragLayers = isSelected ? getMovableRoots(selectedLayerIds) : [layer];

    if (dragLayers.length === 0) {
      return;
    }

    setInteraction({
      kind: "drag",
      startX: point.x,
      startY: point.y,
      layers: dragLayers.map((item) => ({
        id: item.id,
        initialX: item.x,
        initialY: item.y
      }))
    });
  }

  function startResize(event: PointerEvent, layer: LayerNode) {
    if (
      event.button !== 0 ||
      isSpaceDown ||
      activeTool !== "select" ||
      layer.locked ||
      selectedLayerIds.length !== 1 ||
      selectedLayerId !== layer.id
    ) {
      return;
    }

    event.stopPropagation();

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    setInteraction({
      kind: "resize",
      layerId: layer.id,
      startX: point.x,
      startY: point.y,
      initialWidth: layer.width,
      initialHeight: layer.height
    });
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    setInteraction({
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop
    });
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Middle mouse button -> pan.
    if (event.button === 1) {
      event.preventDefault();
      startPan(event);
      return;
    }

    // Space + left mouse -> pan.
    if (isSpaceDown && event.button === 0) {
      event.preventDefault();
      startPan(event);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    if (activeTool !== "select") {
      createLayerAtPoint(point);
      return;
    }

    if (!event.shiftKey) {
      clearSelection();
    }

    setInteraction({
      kind: "marquee",
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: event.shiftKey,
      baseSelectedIds: event.shiftKey ? selectedLayerIds : []
    });
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interaction) {
      return;
    }

    if (interaction.kind === "pan") {
      const viewport = viewportRef.current;

      if (viewport) {
        viewport.scrollLeft =
          interaction.startScrollLeft - (event.clientX - interaction.startClientX);
        viewport.scrollTop =
          interaction.startScrollTop - (event.clientY - interaction.startClientY);
      }

      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    if (interaction.kind === "drag") {
      for (const layerState of interaction.layers) {
        updateLayer(layerState.id, {
          x: round(layerState.initialX + point.x - interaction.startX),
          y: round(layerState.initialY + point.y - interaction.startY)
        });
      }

      return;
    }

    if (interaction.kind === "marquee") {
      setInteraction({
        ...interaction,
        currentX: point.x,
        currentY: point.y
      });
      return;
    }

    updateLayer(interaction.layerId, {
      width: Math.max(24, round(interaction.initialWidth + point.x - interaction.startX)),
      height: Math.max(
        24,
        round(interaction.initialHeight + point.y - interaction.startY)
      )
    });
  }

  function finishInteraction() {
    if (interaction?.kind === "marquee" && marqueeRect) {
      const hasArea = marqueeRect.width > 2 || marqueeRect.height > 2;

      if (hasArea) {
        const marqueeSelection = getMarqueeSelection(marqueeRect);
        const nextIds = interaction.additive
          ? Array.from(new Set([...interaction.baseSelectedIds, ...marqueeSelection]))
          : marqueeSelection;

        selectLayers(nextIds);
      } else if (interaction.additive) {
        selectLayers(interaction.baseSelectedIds);
      } else {
        clearSelection();
      }
    }

    setInteraction(undefined);
  }

  function renderResizeHandle(layer: LayerNode) {
    if (
      selectedLayerIds.length !== 1 ||
      selectedLayerId !== layer.id ||
      activeTool !== "select" ||
      layer.locked
    ) {
      return null;
    }

    return (
      <span
        className="resize-handle se"
        onPointerDown={(event) => startResize(event, layer)}
      />
    );
  }

  function getSelectionClassName(baseClassName: string, layerId: string): string {
    const isSelected = selectedLayerSet.has(layerId);
    const isPrimary = selectedLayerId === layerId;

    return [baseClassName, isSelected ? "selected" : "", isPrimary ? "primary-selected" : ""]
      .filter(Boolean)
      .join(" ");
  }

  function renderPrimitiveLayer(layer: LayerNode) {
    if (!layer.visible) {
      return null;
    }

    const commonStyle = {
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      borderRadius: layer.radius ?? 0,
      background: layer.type === "text" ? "transparent" : layer.fill,
      border: layer.stroke ? `1px solid ${layer.stroke}` : undefined,
      opacity: layer.opacity ?? 1
    };

    if (layer.type === "text") {
      return (
        <div
          className={getSelectionClassName("canvas-layer text-layer", layer.id)}
          key={layer.id}
          role="button"
          tabIndex={0}
          style={{
            ...commonStyle,
            color: layer.fill,
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight
          }}
          onPointerDown={(event) => startDrag(event, layer)}
        >
          {layer.text}
          {renderResizeHandle(layer)}
        </div>
      );
    }

    if (layer.type === "button") {
      return (
        <div
          className={getSelectionClassName("canvas-layer button-layer", layer.id)}
          key={layer.id}
          role="button"
          tabIndex={0}
          style={{
            ...commonStyle,
            color: "#ffffff",
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight
          }}
          onPointerDown={(event) => startDrag(event, layer)}
        >
          {layer.text}
          {renderResizeHandle(layer)}
        </div>
      );
    }

    return (
      <div
        aria-label={layer.name}
        className={getSelectionClassName("canvas-layer shape-layer", layer.id)}
        key={layer.id}
        role="button"
        tabIndex={0}
        style={commonStyle}
        onPointerDown={(event) => startDrag(event, layer)}
      >
        {renderResizeHandle(layer)}
      </div>
    );
  }

  function renderGroupLayer(group: LayerNode): ReactNode {
    if (!group.visible) {
      return null;
    }

    const children = activePage.layers.filter((l) => l.parentId === group.id);

    return (
      <div
        className={getSelectionClassName("group-node", group.id)}
        key={group.id}
        role="button"
        tabIndex={0}
        style={{
          left: group.x,
          top: group.y,
          width: group.width,
          height: group.height
        }}
        onPointerDown={(event) => startDrag(event, group)}
      >
        {children.map((child) => {
          if (child.type === "group") return renderGroupLayer(child);
          return renderPrimitiveLayer(child);
        })}
      </div>
    );
  }

  function renderFrame(frame: LayerNode) {
    if (!frame.visible) {
      return null;
    }

    const children = activePage.layers.filter((layer) => layer.parentId === frame.id);

    return (
      <div
        className={getSelectionClassName("frame-node", frame.id)}
        key={frame.id}
        role="button"
        tabIndex={0}
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          borderRadius: frame.radius,
          background: frame.fill,
          borderColor: frame.stroke
        }}
        onPointerDown={(event) => startDrag(event, frame)}
      >
        <span className="frame-label">{frame.name}</span>
        {children.map((child) => {
          if (child.type === "group") return renderGroupLayer(child);
          return renderPrimitiveLayer(child);
        })}
        {renderResizeHandle(frame)}
      </div>
    );
  }

  const isPanning = interaction?.kind === "pan";

  const viewportClass = [
    "canvas-viewport",
    activeTool !== "select" ? "creating" : "",
    isPanning ? "panning" : isSpaceDown ? "space-down" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="canvas-shell">
      <div className="canvas-toolbar">
        <div className="tool-palette" aria-label={tr(language, "toolbar.tools")}>
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <button
                className={
                  activeTool === tool.id ? "tool-button active" : "tool-button"
                }
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
              >
                <Icon size={15} />
                <span>{tr(language, tool.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <div className="canvas-hint">
          <Sparkles size={15} />
          <span>
            {activeTool === "select"
              ? tr(language, "canvas.hint")
              : tr(language, "toolbar.createHint")}
          </span>
        </div>

        <div className="canvas-tool-pill">
          <Move size={14} />
          <span>{activePage.name}</span>
        </div>
      </div>

      <div
        className={viewportClass}
        ref={viewportRef}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishInteraction}
        onPointerLeave={finishInteraction}
      >
        <div
          style={{
            width: `${(BOARD_WIDTH * zoom) / 100}px`,
            height: `${(BOARD_HEIGHT * zoom) / 100}px`,
            overflow: "hidden",
            flexShrink: 0
          }}
        >
          <div
            className="canvas-content"
            style={{
              transform: `scale(${zoom / 100})`
            }}
          >
            {frames.length > 0 || rootLooseLayers.length > 0 ? (
              <>
                {frames.map(renderFrame)}
                {rootLooseLayers.map((layer) =>
                  layer.type === "group" ? renderGroupLayer(layer) : renderPrimitiveLayer(layer)
                )}
              </>
            ) : (
              <div className="canvas-empty">{tr(language, "canvas.empty")}</div>
            )}

            {marqueeRect && (
              <div
                className="canvas-marquee"
                style={{
                  left: marqueeRect.left,
                  top: marqueeRect.top,
                  width: marqueeRect.width,
                  height: marqueeRect.height
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
