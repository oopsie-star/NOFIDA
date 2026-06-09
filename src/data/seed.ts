import type { DaosProject } from "../types";

export const seedProject: DaosProject = {
  id: "project-nofida-001",
  name: "NOFIDA Corporate Workspace",
  organization: "NOFIDA",
  members: [
    {
      id: "member-1",
      name: "Lead Designer",
      role: "owner"
    },
    {
      id: "member-2",
      name: "Frontend Developer",
      role: "developer"
    }
  ],
  tokens: [
    {
      id: "token-color-bg",
      name: "color.background.canvas",
      type: "color",
      value: "#eef1f7"
    },
    {
      id: "token-color-primary",
      name: "color.brand.primary",
      type: "color",
      value: "#2563eb"
    },
    {
      id: "token-color-text",
      name: "color.text.primary",
      type: "color",
      value: "#111827"
    },
    {
      id: "token-radius-card",
      name: "radius.card",
      type: "radius",
      value: "20px"
    },
    {
      id: "token-spacing-base",
      name: "spacing.base",
      type: "spacing",
      value: "8px"
    }
  ],
  files: [
    {
      id: "file-main",
      name: "NOFIDA Starter File",
      pages: [
        {
          id: "page-product",
          name: "Product screens",
          layers: [
            {
              id: "frame-mobile-home",
              name: "Mobile / Home",
              type: "frame",
              x: 120,
              y: 88,
              width: 390,
              height: 844,
              radius: 34,
              visible: true,
              locked: false,
              fill: "#ffffff",
              stroke: "#d8deea"
            },
            {
              id: "mobile-bg-card",
              name: "Hero card",
              type: "rectangle",
              parentId: "frame-mobile-home",
              x: 24,
              y: 118,
              width: 342,
              height: 188,
              radius: 28,
              visible: true,
              locked: false,
              fill: "#eef4ff",
              stroke: "#d7e4ff"
            },
            {
              id: "mobile-title",
              name: "Title",
              type: "text",
              parentId: "frame-mobile-home",
              x: 24,
              y: 54,
              width: 260,
              height: 34,
              visible: true,
              locked: false,
              text: "NOFIDA Design OS",
              fontSize: 24,
              fontWeight: 700,
              fill: "#111827"
            },
            {
              id: "mobile-subtitle",
              name: "Subtitle",
              type: "text",
              parentId: "frame-mobile-home",
              x: 48,
              y: 154,
              width: 280,
              height: 54,
              visible: true,
              locked: false,
              text: "A secure Figma-like workspace for corporate design teams.",
              fontSize: 16,
              fontWeight: 500,
              fill: "#334155"
            },
            {
              id: "mobile-primary-button",
              name: "Primary button",
              type: "button",
              parentId: "frame-mobile-home",
              x: 48,
              y: 232,
              width: 176,
              height: 48,
              radius: 16,
              visible: true,
              locked: false,
              text: "Open file",
              fontSize: 15,
              fontWeight: 700,
              fill: "#2563eb"
            },
            {
              id: "mobile-list-card",
              name: "Design system card",
              type: "rectangle",
              parentId: "frame-mobile-home",
              x: 24,
              y: 338,
              width: 342,
              height: 118,
              radius: 24,
              visible: true,
              locked: false,
              fill: "#f8fafc",
              stroke: "#e5e7eb"
            },
            {
              id: "mobile-list-text",
              name: "Card text",
              type: "text",
              parentId: "frame-mobile-home",
              x: 48,
              y: 370,
              width: 270,
              height: 44,
              visible: true,
              locked: false,
              text: "Design tokens and components are stored with the file.",
              fontSize: 15,
              fontWeight: 600,
              fill: "#1f2937"
            },
            {
              id: "frame-dashboard",
              name: "Desktop / Dashboard",
              type: "frame",
              x: 620,
              y: 88,
              width: 960,
              height: 640,
              radius: 28,
              visible: true,
              locked: false,
              fill: "#ffffff",
              stroke: "#d8deea"
            },
            {
              id: "dashboard-sidebar",
              name: "Dashboard sidebar",
              type: "rectangle",
              parentId: "frame-dashboard",
              x: 0,
              y: 0,
              width: 232,
              height: 640,
              radius: 28,
              visible: true,
              locked: false,
              fill: "#0f172a"
            },
            {
              id: "dashboard-heading",
              name: "Dashboard heading",
              type: "text",
              parentId: "frame-dashboard",
              x: 272,
              y: 54,
              width: 420,
              height: 42,
              visible: true,
              locked: false,
              text: "Enterprise design workspace",
              fontSize: 30,
              fontWeight: 800,
              fill: "#111827"
            },
            {
              id: "dashboard-card-1",
              name: "Project card",
              type: "rectangle",
              parentId: "frame-dashboard",
              x: 272,
              y: 136,
              width: 280,
              height: 168,
              radius: 24,
              visible: true,
              locked: false,
              fill: "#eff6ff",
              stroke: "#bfdbfe"
            },
            {
              id: "dashboard-card-2",
              name: "Handoff card",
              type: "rectangle",
              parentId: "frame-dashboard",
              x: 584,
              y: 136,
              width: 280,
              height: 168,
              radius: 24,
              visible: true,
              locked: false,
              fill: "#f8fafc",
              stroke: "#e5e7eb"
            },
            {
              id: "dashboard-card-text-1",
              name: "Project card text",
              type: "text",
              parentId: "frame-dashboard",
              x: 300,
              y: 178,
              width: 220,
              height: 58,
              visible: true,
              locked: false,
              text: "Files, pages and layers use a NOFIDA-native structure.",
              fontSize: 16,
              fontWeight: 700,
              fill: "#1e3a8a"
            },
            {
              id: "dashboard-card-text-2",
              name: "Handoff card text",
              type: "text",
              parentId: "frame-dashboard",
              x: 612,
              y: 178,
              width: 220,
              height: 58,
              visible: true,
              locked: false,
              text: "Inspect mode will expose CSS, tokens and measurements.",
              fontSize: 16,
              fontWeight: 700,
              fill: "#334155"
            }
          ]
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