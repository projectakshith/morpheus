import { applyEvent } from "../protocol/reducer";
import type { MorpheusEvent, SessionSnapshot } from "../protocol/types";

export type SubscribeResponse = { snapshot: SessionSnapshot } | { events: MorpheusEvent[] };

export class SessionStore {
  private snapshot: SessionSnapshot | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: MorpheusEvent) => void>();
  private pending: MorpheusEvent[] = [];
  private syncing = false;

  constructor(
    readonly sessionId: string,
    private resync: (afterSeq?: number) => void
  ) {}

  getSnapshot = (): SessionSnapshot | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onEvent(listener: (event: MorpheusEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  get seq(): number | undefined {
    return this.snapshot?.seq;
  }

  beginSync(): void {
    this.syncing = true;
  }

  applySubscribeResponse(response: SubscribeResponse): void {
    this.syncing = false;
    if ("snapshot" in response) {
      this.snapshot = response.snapshot;
    } else {
      for (const event of response.events) this.fold(event, false);
    }
    const buffered = this.pending;
    this.pending = [];
    for (const event of buffered) this.fold(event, true);
    this.notify();
  }

  receive(event: MorpheusEvent): void {
    if (this.syncing || !this.snapshot) {
      this.pending.push(event);
      return;
    }
    if (this.fold(event, true)) this.notify();
  }

  private fold(event: MorpheusEvent, live: boolean): boolean {
    const base = this.snapshot;
    if (!base || event.seq <= base.seq) return false;
    if (event.seq !== base.seq + 1) {
      this.syncing = true;
      this.pending.push(event);
      this.resync(base.seq);
      return false;
    }
    this.snapshot = applyEvent(base, event);
    if (live) for (const listener of this.eventListeners) listener(event);
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
