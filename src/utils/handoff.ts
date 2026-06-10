import type { LayerNode } from "../types";

export interface HandoffRow {
  label: string;
  value: string;
}

function toPx(value: number | undefined): string {
  return `${Math.round(value ?? 0)}px`;
}

function safeClassName(layer: LayerNode): string {
  const normalized = layer.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : `layer-${layer.id}`;
}

export function getLayerHandoffRows(layer: LayerNode): HandoffRow[] {
  return [
    {
      label: "ID",
      value: layer.id
    },
    {
      label: "Type",
      value: layer.type
    },
    {
      label: "Parent",
      value: layer.parentId ?? "none"
    },
    {
      label: "Position",
      value: `x ${toPx(layer.x)}, y ${toPx(layer.y)}`
    },
    {
      label: "Size",
      value: `${toPx(layer.width)} × ${toPx(layer.height)}`
    },
    {
      label: "Radius",
      value: toPx(layer.radius)
    },
    {
      label: "Fill",
      value: layer.fill ?? "none"
    },
    {
      label: "Stroke",
      value: layer.stroke ?? "none"
    },
    {
      label: "Visible",
      value: layer.visible ? "yes" : "no"
    },
    {
      label: "Locked",
      value: layer.locked ? "yes" : "no"
    }
  ];
}

export function getLayerCss(layer: LayerNode): string {
  const declarations: string[] = [
    "position: absolute;",
    `left: ${toPx(layer.x)};`,
    `top: ${toPx(layer.y)};`,
    `width: ${toPx(layer.width)};`,
    `height: ${toPx(layer.height)};`
  ];

  if (layer.type !== "text" && layer.fill) {
    declarations.push(`background: ${layer.fill};`);
  }

  if (layer.stroke) {
    declarations.push(`border: 1px solid ${layer.stroke};`);
  }

  if (layer.radius !== undefined) {
    declarations.push(`border-radius: ${toPx(layer.radius)};`);
  }

  if (layer.opacity !== undefined && layer.opacity < 1) {
    declarations.push(`opacity: ${layer.opacity};`);
  }

  if (layer.type === "text") {
    declarations.push(`color: ${layer.fill ?? "#111827"};`);
    declarations.push(`font-size: ${toPx(layer.fontSize)};`);
    declarations.push(`font-weight: ${layer.fontWeight ?? 400};`);
    declarations.push("line-height: 1.2;");
  }

  if (layer.type === "button") {
    declarations.push("display: inline-flex;");
    declarations.push("align-items: center;");
    declarations.push("justify-content: center;");
    declarations.push("color: #ffffff;");
    declarations.push(`font-size: ${toPx(layer.fontSize)};`);
    declarations.push(`font-weight: ${layer.fontWeight ?? 700};`);
  }

  if (layer.locked) {
    declarations.push("pointer-events: none;");
  }

  if (!layer.visible) {
    declarations.push("display: none;");
  }

  return `.${safeClassName(layer)} {\n  ${declarations.join("\n  ")}\n}`;
}

export function getLayerJson(layer: LayerNode): string {
  return JSON.stringify(layer, null, 2);
}
