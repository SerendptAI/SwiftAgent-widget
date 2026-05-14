export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  kind: "image" | "pdf";
}

export interface AgentBlock {
  kind: "stage" | "text";
  content: string;
}

export interface ChatMsg {
  id: number;
  text: string;
  sender: "user" | "agent";
  time: string;
  attachments?: ChatAttachment[];
  blocks?: AgentBlock[];
  pending?: boolean;
}
