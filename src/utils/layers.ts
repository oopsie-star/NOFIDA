import type { LayerNode } from "../types";

export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface LayerBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function buildLayerMap(layers: LayerNode[]): Map<string, LayerNode> {
  return new Map(layers.map((layer) => [layer.id, layer]));
}

export function getLayerAbsolutePosition(
  layer: LayerNode,
  layerMap: ReadonlyMap<string, LayerNode>
): { x: number; y: number } {
  let x = layer.x;
  let y = layer.y;
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

    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }

  return { x, y };
}

export function getParentAbsolutePosition(
  layer: LayerNode,
  layerMap: ReadonlyMap<string, LayerNode>
): { x: number; y: number } {
  if (!layer.parentId) {
    return { x: 0, y: 0 };
  }

  const parent = layerMap.get(layer.parentId);
  return parent ? getLayerAbsolutePosition(parent, layerMap) : { x: 0, y: 0 };
}

export function getLayerBounds(
  layer: LayerNode,
  layerMap: ReadonlyMap<string, LayerNode>
): LayerBounds {
  const position = getLayerAbsolutePosition(layer, layerMap);

  return {
    left: position.x,
    top: position.y,
    right: position.x + layer.width,
    bottom: position.y + layer.height,
    width: layer.width,
    height: layer.height,
    centerX: position.x + layer.width / 2,
    centerY: position.y + layer.height / 2
  };
}

export function getRelativePositionFromAbsolute(
  layer: LayerNode,
  layerMap: ReadonlyMap<string, LayerNode>,
  absoluteX: number,
  absoluteY: number
): { x: number; y: number } {
  const parentPosition = getParentAbsolutePosition(layer, layerMap);

  return {
    x: absoluteX - parentPosition.x,
    y: absoluteY - parentPosition.y
  };
}

export function getRootLayerIds(
  layers: LayerNode[],
  layerIds: string[]
): string[] {
  const layerMap = buildLayerMap(layers);
  const validLayerIds = Array.from(
    new Set(layerIds.filter((layerId) => layerMap.has(layerId)))
  );
  const selectedSet = new Set(validLayerIds);

  return validLayerIds.filter((layerId) => {
    let parentId = layerMap.get(layerId)?.parentId;
    const visited = new Set<string>();

    while (parentId) {
      if (visited.has(parentId)) {
        break;
      }

      if (selectedSet.has(parentId)) {
        return false;
      }

      visited.add(parentId);
      parentId = layerMap.get(parentId)?.parentId;
    }

    return true;
  });
}

export function normalizeSelectionRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): SelectionRect {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const right = Math.max(startX, currentX);
  const bottom = Math.max(startY, currentY);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

export function intersectsRect(
  bounds: Pick<LayerBounds, "left" | "top" | "right" | "bottom">,
  rect: Pick<SelectionRect, "left" | "top" | "right" | "bottom">
): boolean {
  return (
    bounds.left <= rect.right &&
    bounds.right >= rect.left &&
    bounds.top <= rect.bottom &&
    bounds.bottom >= rect.top
  );
}
