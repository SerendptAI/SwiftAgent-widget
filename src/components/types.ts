export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  kind: "image" | "pdf";
}

export interface NavigationHighlight {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NavigationStep {
  step: number;
  page_title?: string;
  instruction: string;
  screenshot_url?: string;
  highlight?: NavigationHighlight;
}

export interface NavigationGuide {
  steps: NavigationStep[];
  path_summary?: string[];
}

export type AgentBlock =
  | { kind: "stage"; content: string }
  | { kind: "text"; content: string }
  | { kind: "navigation"; guide: NavigationGuide };

export interface ChatMsg {
  id: number;
  text: string;
  sender: "user" | "agent";
  time: string;
  attachments?: ChatAttachment[];
  blocks?: AgentBlock[];
  pending?: boolean;
  durationMs?: number;
}
