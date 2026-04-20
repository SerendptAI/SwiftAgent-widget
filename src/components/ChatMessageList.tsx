import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import { ChatMsg } from "./types";

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
  compact?: boolean;
}

export function ChatMessageList({
  messages,
  thinkingText,
  chatEndRef,
  compact = false,
}: ChatMessageListProps) {
  return (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex w-full",
            msg.sender === "user" ? "justify-start" : "justify-start",
          )}
        >
          {msg.sender === "agent" ? (
            /* Agent message — blue text, no background */
            <div
              className={cn(
                "max-w-[90%] text-[#1a73e8]",
                compact
                  ? "text-[13px] leading-relaxed"
                  : "text-[14px] leading-relaxed",
              )}
            >
              {msg.text ? (
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {msg.text}
                </ReactMarkdown>
              ) : null}
            </div>
          ) : (
            /* User message — bordered rounded box, monospace uppercase */
            <div
              className={cn(
                "font-dm-mono max-w-[90%] rounded-xl border border-gray-200 bg-white text-black uppercase tracking-wide",
                compact
                  ? "px-4 py-2.5 text-[12px]"
                  : "px-5 py-3 text-[13px]",
              )}
            >
              <p>{msg.text}</p>
            </div>
          )}
        </div>
      ))}

      {/* Typing indicator */}
      {thinkingText && (
        <div className="flex w-full justify-start">
          <div className="flex items-center gap-1.5 px-1 py-2">
            <span className="h-2 w-2 animate-[bounce_1.2s_ease-in-out_infinite] rounded-full bg-[#1a73e8]/50" />
            <span className="h-2 w-2 animate-[bounce_1.2s_ease-in-out_0.2s_infinite] rounded-full bg-[#1a73e8]/50" />
            <span className="h-2 w-2 animate-[bounce_1.2s_ease-in-out_0.4s_infinite] rounded-full bg-[#1a73e8]/50" />
          </div>
        </div>
      )}

      {/* Bottom scroll anchor */}
      <div ref={chatEndRef} className={compact ? "h-1 w-full" : "h-2 w-full"} />
    </>
  );
}
