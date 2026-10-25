import { useSyncExternalStore } from "react";
import { getThemeVersion, subscribeTheme } from "../theme";

export function useThemeTick(): number {
  return useSyncExternalStore(subscribeTheme, getThemeVersion, getThemeVersion);
}
