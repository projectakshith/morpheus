/*
 * morpheus/client: everything an interface needs to drive the Morpheus daemon. Browser-safe (no node: imports).
 */

export { MorpheusClient, RpcError, type ClientOptions, type ConnectionState } from "./client.js";
export { SessionStore } from "./store.js";
export { applyEvent } from "../protocol/reducer.js";
export * from "../protocol/types.js";
export type { Thread, ThreadStep, FileEditRecord } from "../core/thread.js";
export type { TokenUsage, Finding } from "../core/types.js";
export type { SuggestionItem, AutocompleteResult } from "../cli/autocomplete/types.js";
export { applySuggestion } from "../cli/autocomplete/apply.js";
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
} from "../cli/components/activity/describeStep.js";
