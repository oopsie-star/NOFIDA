export interface BridgeMessage<T = unknown> {
  source: 'nofida-shell';
  event: string;
  payload: T;
  timestamp: number;
}

/**
 * Decoupled, throw-safe dispatcher for one-way (host → frame) postMessage
 * traffic between the Nofida shell and the embedded Penpot/engine viewport.
 *
 * The class never throws: a missing frame, a torn-down `contentWindow`, or a
 * cross-domain serialization drop are all reported via the boolean return so
 * callers can react without try/catch noise. Keeping a single shared instance
 * (see `globalBridge`) avoids re-registering listeners and leaking references
 * each time a component re-renders.
 */
export class IframeBridge {
  private iframeRef: HTMLIFrameElement | null = null;
  private targetOrigin: string = '*';

  constructor(iframeRef?: HTMLIFrameElement | null, targetOrigin?: string) {
    if (iframeRef) this.iframeRef = iframeRef;
    if (targetOrigin) this.targetOrigin = targetOrigin;
  }

  public setIframe(iframe: HTMLIFrameElement): void {
    this.iframeRef = iframe;
  }

  public setTargetOrigin(origin: string): void {
    this.targetOrigin = origin;
  }

  /**
   * Dispatches high-fidelity manifest sync mutations down into the Penpot engine layer.
   * Returns `true` only when the packet was handed to the frame's `contentWindow`.
   */
  public emit<T = unknown>(event: string, payload: T): boolean {
    if (!this.iframeRef || !this.iframeRef.contentWindow) {
      console.warn('⚠️ [Nofida Bridge] Execution blocked: Target frame window context is unavailable.');
      return false;
    }

    const message: BridgeMessage<T> = {
      source: 'nofida-shell',
      event,
      payload,
      timestamp: Date.now()
    };

    try {
      this.iframeRef.contentWindow.postMessage(message, this.targetOrigin);
      console.log(`📡 [Nofida Bridge] Dispatched event [${event}] out to origin: ${this.targetOrigin}`);
      return true;
    } catch (error) {
      console.error('❌ [Nofida Bridge] Fatal message serialization collapse:', error);
      return false;
    }
  }
}

// Shared singleton bridge context for simple core architecture hooks.
export const globalBridge = new IframeBridge();
