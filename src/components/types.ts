export type WidgetTab = "call" | "chat";

export interface NavigationStep {
  step: number;
  page_title: string;
  instruction: string;
  screenshot_url: string;
  highlight: { x: number; y: number; w: number; h: number };
}

export interface NavigationGuide {
  steps: NavigationStep[];
  path_summary: string[];
}

export interface ChatMsg {
  id: number;
  text: string;
  sender: "user" | "agent";
  time: string;
  navigationGuide?: NavigationGuide;
}
