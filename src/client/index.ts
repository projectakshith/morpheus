/*
 * morpheus/client: everything an interface needs to drive the Morpheus daemon. Browser-safe (no node: imports).
 */

export { MorpheusClient, RpcError, type ClientOptions, type ConnectionState } from "./client";
export { SessionStore } from "./store";
export { applyEvent } from "../protocol/reducer";
export * from "../protocol/types";
export type { Thread, ThreadStep, FileEditRecord } from "../core/thread";
export type { TokenUsage, Finding } from "../core/types";
export type { SuggestionItem, AutocompleteResult } from "../cli/autocomplete/types";
export { applySuggestion } from "../cli/autocomplete/apply";
export {
  describeStep,
  formatDuration,
  parseUnifiedDiff,
  relativePath,
  type StepModel,
  type CardModel,
  type CardBody,
  type QuietItem,
  type DiffRow,
} from "../cli/components/activity/describeStep";
