export interface ChatMsg {
  id: number;
  text: string;
  sender: "user" | "agent";
  time: string;
}
