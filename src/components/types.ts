export type WidgetTab = "call" | "chat";

export interface ChatMsg {
  id: number;
  text: string;
  sender: "user" | "agent";
  time: string;
}
