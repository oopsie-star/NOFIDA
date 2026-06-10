import React, { useEffect, useRef, useState } from 'react';

// Explicit structure of the Nofida Manifest (project.json core schema)
interface ProjectManifest {
  projectId: string;
  version: string;
  tokens: {
    colors: Record<string, string>;
    radii: Record<string, string>;
  };
  structure: {
    pages: Array<{ id: string; name: string; type: string }>;
  };
}

export const Canvas: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isEngineLoading, setIsEngineLoading] = useState<boolean>(true);

  // Initial state representing our clean project data layer
  const [currentManifest, setCurrentManifest] = useState<ProjectManifest>({
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
  });

  const PENPOT_LOCAL_URL = 'http://localhost:9001';

  useEffect(() => {
    // Inbound Message Broker: Processes messages coming from the internal graphics core
    const handleInboundEngineMessages = (event: MessageEvent) => {
      if (event.origin !== PENPOT_LOCAL_URL) return;

      const { type, payload } = event.data;
      console.log(`[NOFIDA Bridge] Inbound event received [${type}]:`, payload);

      // Future handlers for user selection, layers synchronization, and inspector updates
      switch (type) {
        case 'PENPOT_SELECTION_CHANGED':
          console.log('User selected an object inside Penpot Core. Syncing Left/Right panels.');
          break;
        case 'PENPOT_CANVAS_EXPORT':
          console.log('Received raw SVG/CSS layout metadata from Core for AI inspection.');
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handleInboundEngineMessages);
    return () => window.removeEventListener('message', handleInboundEngineMessages);
  }, []);

  const handleEngineLoad = () => {
    setIsEngineLoading(false);
    console.log('Penpot Core Graphics Engine successfully initialized inside NOFIDA Shell.');
    // Sync initial project data right after engine boots up
    sendManifestToEngine('NOFIDA_INIT_PROJECT', currentManifest);
  };

  // Outbound Message Broker: Dispatches instructions, layout trees, and design tokens into the core canvas
  const sendManifestToEngine = (actionType: string, dataPayload: unknown) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) {
      console.error('[NOFIDA Bridge] Transmission failed: Engine viewport is not available.');
      return;
    }

    const messagePayload = {
      source: 'nofida-shell',
      type: actionType,
      payload: dataPayload
    };

    iframeRef.current.contentWindow.postMessage(messagePayload, PENPOT_LOCAL_URL);
    console.log(`[NOFIDA Bridge] Outbound event dispatched [${actionType}]:`, messagePayload);
  };

  // Mock function to test AI-driven runtime updates (simulating user prompting "change accent color to pink")
  const triggerTestAiTokenUpdate = () => {
    const updatedManifest = {
      ...currentManifest,
      tokens: {
        ...currentManifest.tokens,
        colors: { ...currentManifest.tokens.colors, accent: '#FF007A' }
      }
    };
    setCurrentManifest(updatedManifest);
    sendManifestToEngine('NOFIDA_UPDATE_TOKENS', updatedManifest.tokens);
  };

  return (
    <div className="w-full h-full bg-[#F5F5F0] relative overflow-hidden flex items-center justify-center">

      {/* Infrastructure Diagnostic Console Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-3 py-2 rounded-md shadow-sm border border-gray-200 flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-4 text-xs font-mono text-gray-600">
          <span>Engine: <b className="text-green-600">Connected</b></span>
          <span>Bridge: <b className="text-blue-600">Active (postMessage)</b></span>
        </div>
        <button
          onClick={triggerTestAiTokenUpdate}
          className="bg-[#1A1A1A] hover:bg-black text-white text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded transition-colors active:scale-95"
        >
          ⚡ Test Outbound AI Sync (Manifest)
        </button>
      </div>

      {/* Sleek Minimalist Loading Screen */}
      {isEngineLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F5F0] text-[#1A1A1A]">
          <div className="w-8 h-8 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs font-mono tracking-widest uppercase opacity-70">
            Initializing Nofida Core Engine...
          </p>
        </div>
      )}

      {/* Graphics Canvas Viewport */}
      <iframe
        ref={iframeRef}
        src={PENPOT_LOCAL_URL}
        title="Nofida Core Graphics Engine"
        className="w-full h-full border-0 m-0 p-0"
        allow="clipboard-read; clipboard-write; focus-without-user-activation"
        onLoad={handleEngineLoad}
      />
    </div>
  );
};

export default Canvas;
