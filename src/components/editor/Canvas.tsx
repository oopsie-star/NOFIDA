import React, { useEffect, useRef, useState } from 'react';

export const Canvas: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isEngineLoading, setIsEngineLoading] = useState<boolean>(true);

  // Endpoint targeting our local Penpot infrastructure service configured in Stage 1
  const PENPOT_LOCAL_URL = 'http://localhost:9001';

  useEffect(() => {
    // Communication bridge between NOFIDA Shell and Penpot Engine
    const handlePenpotMessages = (event: MessageEvent) => {
      // Security check: Only listen to our trusted infrastructure port
      if (event.origin !== PENPOT_LOCAL_URL) return;

      // Future event hub for AI automation, project token synchronization, and schema extraction
      console.log('NOFIDA Shell received event from Penpot Core:', event.data);
    };

    window.addEventListener('message', handlePenpotMessages);
    return () => window.removeEventListener('message', handlePenpotMessages);
  }, []);

  const handleEngineLoad = () => {
    setIsEngineLoading(false);
    console.log('Penpot Core Graphics Engine successfully initialized inside NOFIDA Shell.');
  };

  return (
    <div className="w-full h-full bg-[#F5F5F0] relative overflow-hidden flex items-center justify-center">

      {/* Sleek Minimalist Loading Screen matching NOFIDA Brand Vibe */}
      {isEngineLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F5F0] text-[#1A1A1A]">
          <div className="w-8 h-8 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs font-mono tracking-widest uppercase opacity-70">
            Initializing Nofida Core Engine...
          </p>
        </div>
      )}

      {/* Production-grade Seamless Graphics Canvas Layer */}
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
