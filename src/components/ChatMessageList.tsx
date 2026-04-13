import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import { ChatMsg } from "./types";

/** Shared markdown component overrides for agent messages */
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="mb-1">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

interface ChatMessageListProps {
  messages: ChatMsg[];
  thinkingText?: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  /** Use compact styling for the minimized chat */
  compact?: boolean;
}

export function ChatMessageList({
  messages,
  thinkingText,
  chatEndRef,
  compact = false,
}: ChatMessageListProps) {
  const bubbleBase = compact
    ? "max-w-[85%] overflow-hidden break-words px-4 py-2.5 text-[13px] leading-relaxed"
    : "max-w-[85%] overflow-hidden break-words px-5 py-3 text-[14px] leading-relaxed sm:max-w-[75%] sm:text-[15px]";

  const userBubble = compact
    ? "rounded-2xl rounded-tr-sm bg-[#f6f6f5] text-gray-900"
    : "rounded-3xl rounded-tr-md bg-[#f6f6f5] text-gray-900";

  const agentBubble = compact
    ? "rounded-2xl rounded-tl-sm bg-[#f0f7ff] text-[#1a73e8]"
    : "rounded-3xl rounded-tl-md bg-[#f0f7ff] text-[#1a73e8]";

  const dotSize = compact ? "h-1.5 w-1.5" : "h-2 w-2";
  const typingBubble = compact
    ? "rounded-2xl rounded-tl-sm bg-[#f0f7ff] px-4 py-3"
    : "rounded-3xl rounded-tl-md bg-[#f0f7ff] px-5 py-4";

  return (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex w-full",
            msg.sender === "user" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className={cn(
              bubbleBase,
              msg.sender === "user" ? userBubble : agentBubble,
            )}
          >
            {msg.sender === "agent" ? (
              msg.text ? (
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {msg.text}
                </ReactMarkdown>
              ) : null
            ) : (
              <p>{msg.text}</p>
            )}
            {msg.time && (
              <p className="mt-1 text-right text-[10px] opacity-50">
                {msg.time}
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Typing indicator */}
      {thinkingText && (
        <div className="flex w-full justify-start">
          <div className={cn("flex items-center gap-1.5", typingBubble)}>
            <span
              className={cn(
                dotSize,
                "animate-[bounce_1.2s_ease-in-out_infinite] rounded-full bg-[#1a73e8]/50",
              )}
            />
            <span
              className={cn(
                dotSize,
                "animate-[bounce_1.2s_ease-in-out_0.2s_infinite] rounded-full bg-[#1a73e8]/50",
              )}
            />
            <span
              className={cn(
                dotSize,
                "animate-[bounce_1.2s_ease-in-out_0.4s_infinite] rounded-full bg-[#1a73e8]/50",
              )}
            />
          </div>
        </div>
      )}

      {/* Bottom scroll anchor */}
      <div ref={chatEndRef} className={compact ? "h-1 w-full" : "h-2 w-full"} />
    </>
  );
}
