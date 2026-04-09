import { Minimize2 } from "lucide-react";

import { cn } from "../lib/cn";
import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";
import { ChatMsg, WidgetTab } from "./types";
import { WidgetHeader } from "./WidgetHeader";

interface WidgetChatTabProps {
  companyName?: string;
  chatMessages: ChatMsg[];
  chatInput: string;
  setChatInput: (val: string) => void;
  handleSendChat: () => void;
  isChatLoading?: boolean;
  chatThinkingText?: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  setActiveWidgetTab: (tab: WidgetTab) => void;
  setIsMinimized: (val: boolean) => void;
}

export function WidgetChatTab({
  companyName,
  chatMessages,
  chatInput,
  setChatInput,
  handleSendChat,
  isChatLoading,
  chatThinkingText,
  chatEndRef,
  setActiveWidgetTab,
  setIsMinimized,
}: WidgetChatTabProps) {
  const initial = companyName ? companyName.charAt(0).toUpperCase() : "W";
  const displayName = companyName || "WELLSPRING NETWORKS SWIFT AGENTS";

  return (
    <div
      className={cn(
        "pointer-events-auto relative z-20 flex h-full w-full flex-col rounded-3xl bg-white",
        "sm:h-[600px] sm:max-h-[calc(100vh-100px)] sm:rounded-4xl",
      )}
    >
      {/* Custom Chat Header */}
      <div className="relative flex shrink-0 items-center justify-between rounded-t-3xl border-b border-gray-100 bg-white px-4 py-3 sm:rounded-t-4xl sm:px-6 sm:py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6433CC] text-sm font-bold text-white sm:h-10 sm:w-10">
            {initial}
          </div>
          <span className="font-dm-mono max-w-[75px] truncate text-xs font-bold tracking-wide text-gray-800 uppercase sm:max-w-[200px] sm:text-sm">
            {displayName}
          </span>
        </div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <WidgetHeader
            activeWidgetTab="chat"
            setActiveWidgetTab={setActiveWidgetTab}
          />
        </div>

        <button
          onClick={() => setIsMinimized(true)}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="scrollbar-none flex-1 space-y-6 overflow-y-auto bg-white px-4 py-6 sm:px-8 sm:py-8">
        <ChatMessageList
          messages={chatMessages}
          thinkingText={chatThinkingText}
          chatEndRef={chatEndRef}
        />
      </div>

      {/* Input */}
      <div className="shrink-0 rounded-b-3xl bg-white px-4 py-4 sm:rounded-b-4xl sm:px-8 sm:py-6">
        <ChatInput
          value={chatInput}
          onChange={setChatInput}
          onSend={handleSendChat}
          isLoading={isChatLoading}
        />
      </div>
    </div>
  );
}
