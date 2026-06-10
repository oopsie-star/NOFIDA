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

  const handleAiGenerateLayout = (prompt: string) => {
    const normalizedPrompt = prompt.toLowerCase();
    const ts = Date.now();
    let generatedPages: Array<{ id: string; name: string; type: string }>;

    if (normalizedPrompt.includes('auth') || normalizedPrompt.includes('login')) {
      generatedPages = [
        { id: `ai_page_${ts}_1`, name: 'AI: Customer Sign-In Screen', type: 'screens' },
        { id: `ai_page_${ts}_2`, name: 'AI: Secure MFA Code Validation', type: 'screens' },
        { id: `ai_page_${ts}_3`, name: 'AI: Password Reset Terminal', type: 'screens' }
      ];
    } else if (
      normalizedPrompt.includes('dash') ||
      normalizedPrompt.includes('crypto') ||
      normalizedPrompt.includes('chart')
    ) {
      generatedPages = [
        { id: `ai_page_${ts}_1`, name: 'AI: Analytical Metric Dashboard', type: 'board' },
        { id: `ai_page_${ts}_2`, name: 'AI: Realtime Ledger Transactions', type: 'screens' },
        { id: `ai_page_${ts}_3`, name: 'AI: Export Settings Hub', type: 'screens' }
      ];
    } else if (
      normalizedPrompt.includes('profile') ||
      normalizedPrompt.includes('user') ||
      normalizedPrompt.includes('account')
    ) {
      generatedPages = [
        { id: `ai_page_${ts}_1`, name: 'AI: User Settings & Identity Profile', type: 'screens' },
        { id: `ai_page_${ts}_2`, name: 'AI: Billing Logs & Invoice Center', type: 'screens' }
      ];
    } else {
      const cleanName = prompt.charAt(0).toUpperCase() + prompt.slice(1);
      generatedPages = [
        { id: `ai_page_${ts}_1`, name: `AI: ${cleanName} Viewport`, type: 'screens' },
        { id: `ai_page_${ts}_2`, name: `AI: ${cleanName} Structural Sub-Layer`, type: 'board' }
      ];
    }

    setCurrentManifest((prev) => {
      const updatedManifest = {
        ...prev,
        structure: {
          ...prev.structure,
          pages: [...prev.structure.pages, ...generatedPages]
        }
      };

      canvasRef.current?.sendManifestToEngine('NOFIDA_AI_APPEND_STRUCTURE', generatedPages);

      return updatedManifest;
    });
  };

  return (
    <main className="daos-app">
      <TopBar />

      <section className="editor-grid">
        <LeftSidebar
          manifest={currentManifest}
          activePageId={activeManifestPageId}
          onPageSelect={handlePageSelect}
          onAiGenerateLayout={handleAiGenerateLayout}
        />
        <Canvas ref={canvasRef} manifest={currentManifest} />
        <RightInspector manifest={currentManifest} />
      </section>

      <StatusBar />
    </main>
  );
}
