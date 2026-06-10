import type { DaosProject, DesignToken } from "../types";
import { starterBoardLayers } from "./starterBoard";

export const foundationTokens: DesignToken[] = [
  {
    id: "color-neutral-0",
    name: "color.neutral.0",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#ffffff",
    description: "White primitive."
  },
  {
    id: "color-neutral-50",
    name: "color.neutral.50",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#f8fafc"
  },
  {
    id: "color-neutral-100",
    name: "color.neutral.100",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#f1f5f9"
  },
  {
    id: "color-neutral-200",
    name: "color.neutral.200",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#e2e8f0"
  },
  {
    id: "color-neutral-300",
    name: "color.neutral.300",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#cbd5e1"
  },
  {
    id: "color-neutral-400",
    name: "color.neutral.400",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#94a3b8"
  },
  {
    id: "color-neutral-500",
    name: "color.neutral.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#64748b"
  },
  {
    id: "color-neutral-600",
    name: "color.neutral.600",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#475569"
  },
  {
    id: "color-neutral-700",
    name: "color.neutral.700",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#334155"
  },
  {
    id: "color-neutral-800",
    name: "color.neutral.800",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#1e293b"
  },
  {
    id: "color-neutral-900",
    name: "color.neutral.900",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#0f172a"
  },
  {
    id: "color-neutral-950",
    name: "color.neutral.950",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#020617"
  },
  {
    id: "color-blue-50",
    name: "color.blue.50",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#eff6ff"
  },
  {
    id: "color-blue-100",
    name: "color.blue.100",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#dbeafe"
  },
  {
    id: "color-blue-300",
    name: "color.blue.300",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#93c5fd"
  },
  {
    id: "color-blue-500",
    name: "color.blue.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#3b82f6"
  },
  {
    id: "color-blue-600",
    name: "color.blue.600",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#2563eb"
  },
  {
    id: "color-blue-700",
    name: "color.blue.700",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#1d4ed8"
  },
  {
    id: "color-violet-500",
    name: "color.violet.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#8b5cf6"
  },
  {
    id: "color-violet-600",
    name: "color.violet.600",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#7c3aed"
  },
  {
    id: "color-green-500",
    name: "color.green.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#22c55e"
  },
  {
    id: "color-amber-500",
    name: "color.amber.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#f59e0b"
  },
  {
    id: "color-red-500",
    name: "color.red.500",
    type: "color",
    group: "token.group.colorPrimitive",
    value: "#ef4444"
  },
  {
    id: "color-background-canvas",
    name: "color.background.canvas",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#eef1f7",
    description: "Main editor canvas background."
  },
  {
    id: "color-surface-primary",
    name: "color.surface.primary",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#ffffff"
  },
  {
    id: "color-surface-muted",
    name: "color.surface.muted",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#f8fafc"
  },
  {
    id: "color-surface-dark",
    name: "color.surface.dark",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#0f172a"
  },
  {
    id: "color-text-primary",
    name: "color.text.primary",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#111827"
  },
  {
    id: "color-text-secondary",
    name: "color.text.secondary",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#475569"
  },
  {
    id: "color-text-muted",
    name: "color.text.muted",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#64748b"
  },
  {
    id: "color-text-inverse",
    name: "color.text.inverse",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#ffffff"
  },
  {
    id: "color-border-subtle",
    name: "color.border.subtle",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#e6eaf2"
  },
  {
    id: "color-border-strong",
    name: "color.border.strong",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#d8deea"
  },
  {
    id: "color-border-focus",
    name: "color.border.focus",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#2563eb"
  },
  {
    id: "color-action-primary",
    name: "color.action.primary",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#2563eb"
  },
  {
    id: "color-action-primary-hover",
    name: "color.action.primary.hover",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#1d4ed8"
  },
  {
    id: "color-action-danger",
    name: "color.action.danger",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#ef4444"
  },
  {
    id: "color-status-success",
    name: "color.status.success",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#22c55e"
  },
  {
    id: "color-status-warning",
    name: "color.status.warning",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#f59e0b"
  },
  {
    id: "color-status-error",
    name: "color.status.error",
    type: "color",
    group: "token.group.colorSemantic",
    value: "#ef4444"
  },
  {
    id: "font-family-sans",
    name: "font.family.sans",
    type: "font",
    group: "token.group.typography",
    value: "Inter, system-ui, sans-serif"
  },
  {
    id: "font-size-11",
    name: "font.size.11",
    type: "font",
    group: "token.group.typography",
    value: "11px"
  },
  {
    id: "font-size-12",
    name: "font.size.12",
    type: "font",
    group: "token.group.typography",
    value: "12px"
  },
  {
    id: "font-size-13",
    name: "font.size.13",
    type: "font",
    group: "token.group.typography",
    value: "13px"
  },
  {
    id: "font-size-14",
    name: "font.size.14",
    type: "font",
    group: "token.group.typography",
    value: "14px"
  },
  {
    id: "font-size-16",
    name: "font.size.16",
    type: "font",
    group: "token.group.typography",
    value: "16px"
  },
  {
    id: "font-size-18",
    name: "font.size.18",
    type: "font",
    group: "token.group.typography",
    value: "18px"
  },
  {
    id: "font-size-20",
    name: "font.size.20",
    type: "font",
    group: "token.group.typography",
    value: "20px"
  },
  {
    id: "font-size-24",
    name: "font.size.24",
    type: "font",
    group: "token.group.typography",
    value: "24px"
  },
  {
    id: "font-size-30",
    name: "font.size.30",
    type: "font",
    group: "token.group.typography",
    value: "30px"
  },
  {
    id: "font-size-36",
    name: "font.size.36",
    type: "font",
    group: "token.group.typography",
    value: "36px"
  },
  {
    id: "font-weight-400",
    name: "font.weight.400",
    type: "font",
    group: "token.group.typography",
    value: "400"
  },
  {
    id: "font-weight-500",
    name: "font.weight.500",
    type: "font",
    group: "token.group.typography",
    value: "500"
  },
  {
    id: "font-weight-600",
    name: "font.weight.600",
    type: "font",
    group: "token.group.typography",
    value: "600"
  },
  {
    id: "font-weight-700",
    name: "font.weight.700",
    type: "font",
    group: "token.group.typography",
    value: "700"
  },
  {
    id: "font-weight-800",
    name: "font.weight.800",
    type: "font",
    group: "token.group.typography",
    value: "800"
  },
  {
    id: "spacing-0",
    name: "spacing.0",
    type: "spacing",
    group: "token.group.spacing",
    value: "0px"
  },
  {
    id: "spacing-2",
    name: "spacing.2",
    type: "spacing",
    group: "token.group.spacing",
    value: "2px"
  },
  {
    id: "spacing-4",
    name: "spacing.4",
    type: "spacing",
    group: "token.group.spacing",
    value: "4px"
  },
  {
    id: "spacing-6",
    name: "spacing.6",
    type: "spacing",
    group: "token.group.spacing",
    value: "6px"
  },
  {
    id: "spacing-8",
    name: "spacing.8",
    type: "spacing",
    group: "token.group.spacing",
    value: "8px"
  },
  {
    id: "spacing-10",
    name: "spacing.10",
    type: "spacing",
    group: "token.group.spacing",
    value: "10px"
  },
  {
    id: "spacing-12",
    name: "spacing.12",
    type: "spacing",
    group: "token.group.spacing",
    value: "12px"
  },
  {
    id: "spacing-16",
    name: "spacing.16",
    type: "spacing",
    group: "token.group.spacing",
    value: "16px"
  },
  {
    id: "spacing-20",
    name: "spacing.20",
    type: "spacing",
    group: "token.group.spacing",
    value: "20px"
  },
  {
    id: "spacing-24",
    name: "spacing.24",
    type: "spacing",
    group: "token.group.spacing",
    value: "24px"
  },
  {
    id: "spacing-32",
    name: "spacing.32",
    type: "spacing",
    group: "token.group.spacing",
    value: "32px"
  },
  {
    id: "spacing-40",
    name: "spacing.40",
    type: "spacing",
    group: "token.group.spacing",
    value: "40px"
  },
  {
    id: "spacing-48",
    name: "spacing.48",
    type: "spacing",
    group: "token.group.spacing",
    value: "48px"
  },
  {
    id: "spacing-64",
    name: "spacing.64",
    type: "spacing",
    group: "token.group.spacing",
    value: "64px"
  },
  {
    id: "radius-0",
    name: "radius.0",
    type: "radius",
    group: "token.group.radius",
    value: "0px"
  },
  {
    id: "radius-4",
    name: "radius.4",
    type: "radius",
    group: "token.group.radius",
    value: "4px"
  },
  {
    id: "radius-8",
    name: "radius.8",
    type: "radius",
    group: "token.group.radius",
    value: "8px"
  },
  {
    id: "radius-10",
    name: "radius.10",
    type: "radius",
    group: "token.group.radius",
    value: "10px"
  },
  {
    id: "radius-12",
    name: "radius.12",
    type: "radius",
    group: "token.group.radius",
    value: "12px"
  },
  {
    id: "radius-16",
    name: "radius.16",
    type: "radius",
    group: "token.group.radius",
    value: "16px"
  },
  {
    id: "radius-20",
    name: "radius.20",
    type: "radius",
    group: "token.group.radius",
    value: "20px"
  },
  {
    id: "radius-24",
    name: "radius.24",
    type: "radius",
    group: "token.group.radius",
    value: "24px"
  },
  {
    id: "radius-28",
    name: "radius.28",
    type: "radius",
    group: "token.group.radius",
    value: "28px"
  },
  {
    id: "radius-32",
    name: "radius.32",
    type: "radius",
    group: "token.group.radius",
    value: "32px"
  },
  {
    id: "radius-full",
    name: "radius.full",
    type: "radius",
    group: "token.group.radius",
    value: "999px"
  },
  {
    id: "shadow-none",
    name: "shadow.none",
    type: "shadow",
    group: "token.group.shadow",
    value: "none"
  },
  {
    id: "shadow-sm",
    name: "shadow.sm",
    type: "shadow",
    group: "token.group.shadow",
    value: "0 1px 2px rgba(15, 23, 42, 0.08)"
  },
  {
    id: "shadow-md",
    name: "shadow.md",
    type: "shadow",
    group: "token.group.shadow",
    value: "0 8px 24px rgba(15, 23, 42, 0.12)"
  },
  {
    id: "shadow-lg",
    name: "shadow.lg",
    type: "shadow",
    group: "token.group.shadow",
    value: "0 18px 60px rgba(15, 23, 42, 0.12)"
  },
  {
    id: "shadow-focus",
    name: "shadow.focus",
    type: "shadow",
    group: "token.group.shadow",
    value: "0 0 0 3px rgba(37, 99, 235, 0.14)"
  },
  {
    id: "border-width-0",
    name: "border.width.0",
    type: "border",
    group: "token.group.border",
    value: "0px"
  },
  {
    id: "border-width-1",
    name: "border.width.1",
    type: "border",
    group: "token.group.border",
    value: "1px"
  },
  {
    id: "border-width-2",
    name: "border.width.2",
    type: "border",
    group: "token.group.border",
    value: "2px"
  },
  {
    id: "opacity-disabled",
    name: "opacity.disabled",
    type: "opacity",
    group: "token.group.opacity",
    value: "0.45"
  },
  {
    id: "opacity-muted",
    name: "opacity.muted",
    type: "opacity",
    group: "token.group.opacity",
    value: "0.7"
  },
  {
    id: "opacity-full",
    name: "opacity.full",
    type: "opacity",
    group: "token.group.opacity",
    value: "1"
  }
];

export const seedProject: DaosProject = {
  id: "project-nofida-001",
  name: "NOFIDA Corporate Workspace",
  organization: "NOFIDA",
  members: [
    { id: "member-1", name: "Lead Designer", role: "owner" },
    { id: "member-2", name: "Frontend Developer", role: "developer" }
  ],
  tokens: foundationTokens,
  files: [
    {
      id: "file-main",
      name: "NOFIDA Starter File",
      pages: [
        {
          id: "page-product",
          name: "Product screens",
          layers: starterBoardLayers
        },
        {
          id: "page-components",
          name: "Components",
          layers: [
            {
              id: "frame-components",
              name: "Component Library",
              type: "frame",
              x: 160,
              y: 120,
              width: 760,
              height: 520,
              radius: 30,
              visible: true,
              locked: false,
              fill: "#ffffff",
              stroke: "#d8deea"
            },
            {
              id: "components-title",
              name: "Library title",
              type: "text",
              parentId: "frame-components",
              x: 48,
              y: 48,
              width: 420,
              height: 40,
              visible: true,
              locked: false,
              text: "Base component library",
              fontSize: 28,
              fontWeight: 800,
              fill: "#111827"
            },
            {
              id: "components-button",
              name: "Button / Primary",
              type: "button",
              parentId: "frame-components",
              x: 48,
              y: 132,
              width: 188,
              height: 52,
              radius: 16,
              visible: true,
              locked: false,
              text: "Primary action",
              fontSize: 15,
              fontWeight: 700,
              fill: "#2563eb"
            }
          ]
        }
      ]
    }
  ]
};
