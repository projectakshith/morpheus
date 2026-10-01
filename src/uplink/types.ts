export interface UplinkElement {
  id: number;
  tag: "a" | "button" | "input" | "select" | "textarea";
  text: string;
  href?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  value?: string;
}

export interface UplinkPage {
  url: string;
  title: string;
  content: string;
  elements: Map<number, UplinkElement>;
  outline?: string[];
  status: number;
  timestamp: number;
}

export interface UplinkSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface UplinkSearchResponse {
  query: string;
  provider: string;
  results: UplinkSearchResult[];
}

export type UplinkBrowseAction =
  | "navigate"
  | "click"
  | "scroll"
  | "find"
  | "back"
  | "forward"
  | "snapshot";

export interface UplinkBrowseParams {
  action: UplinkBrowseAction;
  url?: string;
  ref?: number;
  direction?: "up" | "down";
  lines?: number;
  query?: string;
}

export interface UplinkSearchParams {
  query: string;
  count?: number;
}
