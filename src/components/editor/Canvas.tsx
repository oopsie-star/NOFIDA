import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { globalBridge } from '../../utils/IframeBridge';

export interface ProjectManifest {
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

export interface CanvasHandle {
  sendManifestToEngine: (actionType: string, dataPayload: unknown) => void;
}

interface CanvasProps {
  manifest: ProjectManifest;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ manifest }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isEngineLoading, setIsEngineLoading] = useState<boolean>(true);

  const DEFAULT_PENPOT_ENGINE_URL = 'https://engine.sys.bachopus.com';
  const PENPOT_ENGINE_URL =
    import.meta.env.VITE_PENPOT_ENGINE_URL?.trim() || DEFAULT_PENPOT_ENGINE_URL;

  const sendManifestToEngine = (actionType: string, dataPayload: unknown) => {
    if (!iframeRef.current?.contentWindow) {
      console.error('[NOFIDA Bridge] Transmission failed: Engine viewport is not available.');
      return;
    }
    const messagePayload = { source: 'nofida-shell', type: actionType, payload: dataPayload };
    iframeRef.current.contentWindow.postMessage(messagePayload, PENPOT_ENGINE_URL);
    console.log(`[NOFIDA Bridge] Outbound event dispatched [${actionType}]:`, messagePayload);
  };

  useImperativeHandle(ref, () => ({ sendManifestToEngine }));

  useEffect(() => {
    const handleInboundEngineMessages = (event: MessageEvent) => {
      if (event.origin !== PENPOT_ENGINE_URL) return;
      const { type, payload } = event.data;
      console.log(`[NOFIDA Bridge] Inbound event received [${type}]:`, payload);
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

  // Register the live iframe node with the decoupled outbound bridge singleton.
  // Runs once after commit, when the iframe element is mounted in the DOM.
  useEffect(() => {
    if (iframeRef.current) {
      globalBridge.setIframe(iframeRef.current);
      globalBridge.setTargetOrigin(PENPOT_ENGINE_URL);
    }
  }, []);

  const handleEngineLoad = () => {
    setIsEngineLoading(false);
    console.log('Nofida Cloud Graphics Core successfully initialized.');
    sendManifestToEngine('NOFIDA_INIT_PROJECT', manifest);
  };

  return (
    <div className="w-full h-full bg-[#F5F5F0] relative overflow-hidden flex items-center justify-center">

      {isEngineLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F5F0] text-[#1A1A1A]">
          <div className="w-8 h-8 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs font-mono tracking-widest uppercase opacity-70">
            Connecting Cloud Graphics Core...
          </p>
        </div>
      )}

      {/* Graphics Canvas Viewport */}
      <iframe
        ref={iframeRef}
        src={PENPOT_ENGINE_URL}
        title="Nofida Core Graphics Engine"
        className="w-full h-full border-0 m-0 p-0"
        allow="clipboard-read; clipboard-write; focus-without-user-activation"
        onLoad={handleEngineLoad}
      />
    </div>
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;
