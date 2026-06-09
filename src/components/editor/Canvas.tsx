import {
  Frame,
  MousePointer2,
  Move,
  Sparkles,
  Square,
  Type
} from "lucide-react";
import type { PointerEvent } from "react";
import { useRef, useState } from "react";
import { tr } from "../../i18n";
import { getActivePage, useDaosStore } from "../../store/useDaosStore";
import type { CanvasTool, LayerNode } from "../../types";

interface CanvasPoint {
  x: number;
  y: number;
}

type Interaction =
  | {
      kind: "drag";
      layerId: string;
      startX: number;
      startY: number;
      initialX: number;
      initialY: number;
    }
  | {
      kind: "resize";
      layerId: string;
      startX: number;
      startY: number;
      initialWidth: number;
      initialHeight: number;
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

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction | undefined>();

  const language = useDaosStore((state) => state.language);
  const activePage = useDaosStore(getActivePage);
  const selectedLayerId = useDaosStore((state) => state.selectedLayerId);
  const selectLayer = useDaosStore((state) => state.selectLayer);
  const zoom = useDaosStore((state) => state.zoom);
  const activeTool = useDaosStore((state) => state.activeTool);
  const setActiveTool = useDaosStore((state) => state.setActiveTool);
  const createLayer = useDaosStore((state) => state.createLayer);
  const updateLayer = useDaosStore((state) => state.updateLayer);

  const frames = activePage.layers.filter((layer) => layer.type === "frame");
  const rootLooseLayers = activePage.layers.filter(
    (layer) => !layer.parentId && layer.type !== "frame"
  );

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
        height: 320,
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
    if (activeTool !== "select" || layer.locked) {
      return;
    }

    event.stopPropagation();
    selectLayer(layer.id);

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    setInteraction({
      kind: "drag",
      layerId: layer.id,
      startX: point.x,
      startY: point.y,
      initialX: layer.x,
      initialY: layer.y
    });
  }

  function startResize(event: PointerEvent, layer: LayerNode) {
    if (activeTool !== "select" || layer.locked) {
      return;
    }

    event.stopPropagation();
    selectLayer(layer.id);

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

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    if (activeTool !== "select") {
      createLayerAtPoint(point);
      return;
    }

    if (
      event.target === event.currentTarget ||
      (event.target as HTMLElement).classList.contains("canvas-content")
    ) {
      selectLayer(undefined);
    }
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interaction) {
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    if (interaction.kind === "drag") {
      updateLayer(interaction.layerId, {
        x: round(interaction.initialX + point.x - interaction.startX),
        y: round(interaction.initialY + point.y - interaction.startY)
      });

      return;
    }

    updateLayer(interaction.layerId, {
      width: Math.max(24, round(interaction.initialWidth + point.x - interaction.startX)),
      height: Math.max(24, round(interaction.initialHeight + point.y - interaction.startY))
    });
  }

  function renderResizeHandle(layer: LayerNode) {
    if (selectedLayerId !== layer.id || activeTool !== "select") {
      return null;
    }

    return (
      <span
        className="resize-handle se"
        onPointerDown={(event) => startResize(event, layer)}
      />
    );
  }

  function renderPrimitiveLayer(layer: LayerNode) {
    const isSelected = selectedLayerId === layer.id;

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
          className={isSelected ? "canvas-layer text-layer selected" : "canvas-layer text-layer"}
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
          className={isSelected ? "canvas-layer button-layer selected" : "canvas-layer button-layer"}
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
        className={isSelected ? "canvas-layer shape-layer selected" : "canvas-layer shape-layer"}
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

  function renderFrame(frame: LayerNode) {
    const children = activePage.layers.filter((layer) => layer.parentId === frame.id);
    const isSelected = selectedLayerId === frame.id;

    return (
      <div
        className={isSelected ? "frame-node selected" : "frame-node"}
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
        {children.map(renderPrimitiveLayer)}
        {renderResizeHandle(frame)}
      </div>
    );
  }

  return (
    <section className="canvas-shell">
      <div className="canvas-toolbar">
        <div className="tool-palette" aria-label={tr(language, "toolbar.tools")}>
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <button
                className={activeTool === tool.id ? "tool-button active" : "tool-button"}
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
        className={activeTool === "select" ? "canvas-viewport" : "canvas-viewport creating"}
        ref={viewportRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={() => setInteraction(undefined)}
        onPointerLeave={() => setInteraction(undefined)}
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
              {rootLooseLayers.map(renderPrimitiveLayer)}
            </>
          ) : (
            <div className="canvas-empty">{tr(language, "canvas.empty")}</div>
          )}
        </div>
      </div>
    </section>
  );
}