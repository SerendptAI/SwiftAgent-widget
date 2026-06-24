/** Metadata returned by the upload endpoint, sent on to the chat endpoint. */
export interface UploadedAttachment {
  url: string;
  type: "image" | "document";
  mime_type: string;
  filename: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Local object URL used for an instant preview thumbnail. */
  url: string;
  kind: "image" | "pdf";
  /** Upload lifecycle for the two-step send flow. Absent ⇒ treated as ready. */
  status?: "uploading" | "ready" | "error";
  /** Human-readable reason when `status === "error"`. */
  errorMessage?: string;
  /** Cloudinary metadata from the upload endpoint; included in the send body. */
  uploaded?: UploadedAttachment;
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
  /** Epoch ms the message was sent; used to render its date + time. */
  createdAt?: number;
  /** Human support agent who sent this reply. Absent ⇒ the AI agent. */
  agentName?: string;
  agentAvatarUrl?: string;
}
