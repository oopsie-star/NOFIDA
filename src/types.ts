export type Language = "ru" | "en";

export type EditorMode = "design" | "prototype" | "inspect" | "tokens";

export type SidebarTab = "pages" | "layers" | "assets";

export type CanvasTool = "select" | "frame" | "rectangle" | "text" | "button";

export type AlignMode =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom";

export type DistributionAxis = "horizontal" | "vertical";

export type LayerType =
  | "frame"
  | "group"
  | "rectangle"
  | "text"
  | "button"
  | "image";

export type DesignTokenType =
  | "color"
  | "font"
  | "spacing"
  | "radius"
  | "shadow"
  | "border"
  | "opacity";

export interface LayerNode {
  id: string;
  name: string;
  type: LayerType;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  rotation?: number;
  visible: boolean;
  locked: boolean;
  fill?: string;
  stroke?: string;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface DesignPage {
  id: string;
  name: string;
  layers: LayerNode[];
}

export interface DesignFile {
  id: string;
  name: string;
  pages: DesignPage[];
}

export interface WorkspaceMember {
  id: string;
  name: string;
  role: "owner" | "admin" | "designer" | "developer" | "viewer";
}

export interface DesignToken {
  id: string;
  name: string;
  value: string;
  type: DesignTokenType;
  group: string;
  description?: string;
}

export interface DaosProject {
  id: string;
  name: string;
  organization: string;
  members: WorkspaceMember[];
  files: DesignFile[];
  tokens: DesignToken[];
}
