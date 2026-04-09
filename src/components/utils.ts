/** Map raw status strings to user-friendly display text */
export function getFriendlyStatus(status: string): string {
  const s = status.toLowerCase();
  switch (s) {
    case "connecting":
    case "calling":
      return "Calling...";
    case "ready":
      return "Listening";
    case "thinking":
      return "Thinking...";
    case "speaking":
      return "Speaking";
    case "error":
      return "Error";
    case "idle":
      return "Ended";
    default:
      return s;
  }
}
