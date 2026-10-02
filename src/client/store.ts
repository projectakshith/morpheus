/*
 * SessionStore: client-side mirror of one daemon session. Folds events with the shared reducer and
 * exposes subscribe/getSnapshot, which plugs straight into React's useSyncExternalStore.
 */

import { applyEvent } from "../protocol/reducer.js";
import type { MorpheusEvent, SessionSnapshot } from "../protocol/types.js";

export type SubscribeResponse = { snapshot: SessionSnapshot } | { events: MorpheusEvent[] };

export class SessionStore {
  private snapshot: SessionSnapshot | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: MorpheusEvent) => void>();
  /* Events can arrive before the subscribe response; hold them until a base snapshot exists. */
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

  /* Live event feed, for hints the snapshot doesn't carry (session.switched, ui.request). */
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
      /* A gap means we missed events; ask the daemon to fill it. */
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
