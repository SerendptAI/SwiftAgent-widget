import { Maximize2 } from "lucide-react";
import { useMemo } from "react";

import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";
import { Icons } from "./icons";
import { ChatMsg } from "./types";

interface WidgetMinimizedChatProps {
  companyName?: string;
  chatMessages: ChatMsg[];
  chatInput: string;
  setChatInput: (val: string) => void;
  handleSendChat: () => void;
  isChatLoading?: boolean;
  chatThinkingText?: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  setIsMinimized: (val: boolean) => void;
}

export function WidgetMinimizedChat({
  companyName,
  chatMessages,
  chatInput,
  setChatInput,
  handleSendChat,
  isChatLoading,
  chatThinkingText,
  chatEndRef,
  setIsMinimized,
}: WidgetMinimizedChatProps) {
  const initial = companyName ? companyName.charAt(0).toUpperCase() : "W";
  const displayName = companyName || "WELLSPRING NETWORKS";

  // Memoize to avoid creating new Date on every re-render
  const timeLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, []);

  return (
    <div className="pointer-events-none fixed right-0 bottom-0 z-50 flex h-full w-full flex-col items-end justify-end p-4 sm:p-6">
      {/* Minimized Chat Card */}
      <div className="widget-animate-minimized-chat-in pointer-events-auto mb-5 flex h-[400px] w-[340px] flex-col rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:w-[380px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6433CC] text-sm font-bold text-white">
              {initial}
            </div>
            <span className="font-dm-mono max-w-[160px] truncate text-xs font-bold tracking-wide text-gray-800 uppercase sm:max-w-[200px]">
              {displayName}
            </span>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Expand"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Timestamp */}
        <div className="px-4 pb-2 text-center">
          <span className="text-[11px] text-gray-400">{timeLabel}</span>
        </div>

        {/* Messages */}
        <div className="scrollbar-none flex h-[280px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
          <ChatMessageList
            messages={chatMessages}
            thinkingText={chatThinkingText}
            chatEndRef={chatEndRef}
            compact
          />
        </div>

        {/* Input */}
        <div className="px-3 py-3">
          <ChatInput
            value={chatInput}
            onChange={setChatInput}
            onSend={handleSendChat}
            isLoading={isChatLoading}
            compact
          />
        </div>
      </div>

      {/* Restore Button */}
      <button
        onClick={() => setIsMinimized(false)}
        className="widget-animate-float-in pointer-events-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-transform hover:scale-105 sm:h-[72px] sm:w-[72px]"
        title="Expand Call"
      >
        <Icons.phoneIncoming className="h-7 w-7 animate-pulse text-black sm:h-8 sm:w-8" />
      </button>
    </div>
  );
}
