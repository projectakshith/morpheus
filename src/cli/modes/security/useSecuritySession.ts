import { useSyncExternalStore } from "react";
import {
  getSecuritySession,
  subscribeSecuritySession,
} from "../../../core/securitySession";

export function useSecuritySession() {
  return useSyncExternalStore(
    subscribeSecuritySession,
    getSecuritySession,
    getSecuritySession
  );
}
