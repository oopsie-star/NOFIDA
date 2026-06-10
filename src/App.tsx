import { useRef, useState } from "react";
import { Canvas, type CanvasHandle, type ProjectManifest } from "./components/editor/Canvas";
import { LeftSidebar } from "./components/editor/LeftSidebar";
import { RightInspector } from "./components/editor/RightInspector";
import { StatusBar } from "./components/editor/StatusBar";
import { TopBar } from "./components/editor/TopBar";

const initialManifest: ProjectManifest = {
  projectId: 'nofida-v0-init',
  version: '1.0.0',
  tokens: {
    colors: { primary: '#1A1A1A', accent: '#BFFF00', background: '#F5F5F0' },
    radii: { md: '8px', lg: '16px' }
  },
  structure: {
    pages: [
      { id: 'page_01', name: 'Product Map & User Flow', type: 'board' },
      { id: 'page_02', name: 'UI Architecture', type: 'screens' }
    ]
  }
};

export default function App() {
  const [currentManifest, setCurrentManifest] = useState<ProjectManifest>(initialManifest);
  const [activeManifestPageId, setActiveManifestPageId] = useState<string>('page_01');
  const canvasRef = useRef<CanvasHandle>(null);

  const handlePageSelect = (pageId: string) => {
    setActiveManifestPageId(pageId);
    canvasRef.current?.sendManifestToEngine('PENPOT_SWITCH_PAGE', { pageId });
  };

  const handleAddAiPage = () => {
    const newPage = {
      id: `page_${Date.now()}`,
      name: 'AI Generated Interface',
      type: 'screens'
    };
    setCurrentManifest((prev) => ({
      ...prev,
      structure: { pages: [...prev.structure.pages, newPage] }
    }));
  };

  return (
    <main className="daos-app">
      <TopBar />

      <section className="editor-grid">
        <LeftSidebar
          manifest={currentManifest}
          activePageId={activeManifestPageId}
          onPageSelect={handlePageSelect}
          onAddAiPage={handleAddAiPage}
        />
        <Canvas ref={canvasRef} manifest={currentManifest} />
        <RightInspector />
      </section>

      <StatusBar />
    </main>
  );
}
