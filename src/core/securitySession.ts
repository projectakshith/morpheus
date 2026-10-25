import type { Engagement } from "./engagement";

export interface SecuritySessionState {
  active: boolean;
  target?: string;
  engagementId?: string;
  model?: string;
  previousModel?: string;
}

type Listener = () => void;

let state: SecuritySessionState = { active: false };
const listeners = new Set<Listener>();

export function getSecuritySession(): SecuritySessionState {
  return state;
}

export function subscribeSecuritySession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSecuritySession(next: Partial<SecuritySessionState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function activateSecuritySession(engagement: Engagement): void {
  setSecuritySession({
    active: true,
    target: engagement.target,
    engagementId: engagement.id,
  });
}

export function beginSecuritySession(target?: string): void {
  setSecuritySession({ active: true, target, engagementId: undefined });
}

export function deactivateSecuritySession(): void {
  state = {
    active: false,
    target: undefined,
    engagementId: undefined,
  };
  for (const listener of listeners) listener();
}
