import type { DaosProject, EditorMode, Language } from "../types";

export interface NofidaFileSnapshot {
  schema: "nofida.design.file";
  version: 1;
  exportedAt: string;
  project: DaosProject;
  activeFileId: string;
  activePageId: string;
  selectedLayerId?: string;
  selectedLayerIds?: string[];
  zoom: number;
  mode: EditorMode;
  language: Language;
}

export type ParseNofidaFileResult =
  | {
      ok: true;
      snapshot: NofidaFileSnapshot;
    }
  | {
      ok: false;
      error: string;
    };

interface BuildSnapshotInput {
  project: DaosProject;
  activeFileId: string;
  activePageId: string;
  selectedLayerId?: string;
  selectedLayerIds?: string[];
  zoom: number;
  mode: EditorMode;
  language: Language;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidProjectShape(value: unknown): value is DaosProject {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return false;
  }

  if (!Array.isArray(value.files) || value.files.length === 0) {
    return false;
  }

  if (!Array.isArray(value.tokens)) {
    return false;
  }

  for (const file of value.files) {
    if (!isRecord(file)) {
      return false;
    }

    if (typeof file.id !== "string" || typeof file.name !== "string") {
      return false;
    }

    if (!Array.isArray(file.pages) || file.pages.length === 0) {
      return false;
    }

    for (const page of file.pages) {
      if (!isRecord(page)) {
        return false;
      }

      if (typeof page.id !== "string" || typeof page.name !== "string") {
        return false;
      }

      if (!Array.isArray(page.layers)) {
        return false;
      }
    }
  }

  return true;
}

function safeLanguage(value: unknown): Language {
  return value === "en" || value === "ru" ? value : "ru";
}

function safeMode(value: unknown): EditorMode {
  return value === "design" ||
    value === "prototype" ||
    value === "inspect" ||
    value === "tokens"
    ? value
    : "design";
}

function safeZoom(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 82;
  }

  return Math.min(200, Math.max(25, Math.round(value)));
}

function normalizeSnapshot(value: unknown): NofidaFileSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.schema !== "nofida.design.file" || value.version !== 1) {
    return undefined;
  }

  if (!hasValidProjectShape(value.project)) {
    return undefined;
  }

  const firstFile = value.project.files[0];
  const activeFile =
    typeof value.activeFileId === "string"
      ? value.project.files.find((file) => file.id === value.activeFileId) ?? firstFile
      : firstFile;

  const firstPage = activeFile.pages[0];
  const activePage =
    typeof value.activePageId === "string"
      ? activeFile.pages.find((page) => page.id === value.activePageId) ?? firstPage
      : firstPage;

  const selectedLayerId =
    typeof value.selectedLayerId === "string" &&
    activePage.layers.some((layer) => layer.id === value.selectedLayerId)
      ? value.selectedLayerId
      : undefined;
  const selectedLayerIds = Array.isArray(value.selectedLayerIds)
    ? Array.from(
        new Set(
          value.selectedLayerIds.filter(
            (layerId): layerId is string =>
              typeof layerId === "string" &&
              activePage.layers.some((layer) => layer.id === layerId)
          )
        )
      )
    : selectedLayerId
      ? [selectedLayerId]
      : undefined;

  return {
    schema: "nofida.design.file",
    version: 1,
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
    project: value.project,
    activeFileId: activeFile.id,
    activePageId: activePage.id,
    selectedLayerId,
    selectedLayerIds,
    zoom: safeZoom(value.zoom),
    mode: safeMode(value.mode),
    language: safeLanguage(value.language)
  };
}

function makeSafeFileName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "nofida-file";
}

export function buildNofidaSnapshot(
  input: BuildSnapshotInput
): NofidaFileSnapshot {
  return {
    schema: "nofida.design.file",
    version: 1,
    exportedAt: new Date().toISOString(),
    project: input.project,
    activeFileId: input.activeFileId,
    activePageId: input.activePageId,
    selectedLayerId: input.selectedLayerId,
    selectedLayerIds: input.selectedLayerIds,
    zoom: input.zoom,
    mode: input.mode,
    language: input.language
  };
}

export function parseNofidaFile(rawText: string): ParseNofidaFileResult {
  try {
    const parsed: unknown = JSON.parse(rawText);
    const snapshot = normalizeSnapshot(parsed);

    if (!snapshot) {
      return {
        ok: false,
        error: "Invalid NOFIDA file format."
      };
    }

    return {
      ok: true,
      snapshot
    };
  } catch {
    return {
      ok: false,
      error: "File is not valid JSON."
    };
  }
}

export function downloadNofidaSnapshot(snapshot: NofidaFileSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${makeSafeFileName(snapshot.project.name)}.nofida.json`;

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file as text."));
    };

    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsText(file);
  });
}
