import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import { type ChatAttachment, type ChatMsg } from "./types";

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

function attachmentLabel(file: ChatAttachment) {
  if (file.kind === "pdf") return "PDF";

  return file.name.split(".").pop()?.slice(0, 3).toUpperCase() || "IMG";
}

export function ChatMessageList({
  messages,
  thinkingText,
  chatEndRef,
  compact = false,
}: ChatMessageListProps) {
  return (
    <>
      {messages.map((msg, index) => (
        <div
          key={msg.id}
          className={cn(
            "flex w-full",
            index > 0 && "mt-8",
            msg.sender === "user" ? "justify-end" : "justify-start",
          )}
        >
          {msg.sender === "agent" ? (
            <div
              className={cn(
                "font-sans max-w-[90%] rounded-[24px] bg-[#F2F8FF] px-4 py-2.5 text-[#006BE5]",
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
            /* User message */
            <div
              className={cn(
                "font-sans flex max-w-[90%] flex-col items-end text-black tracking-wide",
                compact ? "text-[12px]" : "text-[13px]",
              )}
            >
              {msg.attachments?.length ? (
                <div
                  className={cn(
                    "flex flex-col items-end gap-2",
                    msg.text && "-mb-[22px]",
                  )}
                >
                  {msg.attachments.map((file) =>
                    file.kind === "image" ? (
                      <img
                        key={file.id}
                        src={file.url}
                        alt={file.name}
                        className="max-h-40 w-56 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#E93333] text-xs font-bold text-white">
                          {attachmentLabel(file)}
                        </span>
                        <span className="max-w-36 truncate text-xs text-gray-700">
                          {file.name}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : null}

              {msg.text ? (
                <div
                  className={cn(
                    "rounded-[24px] bg-[#006BE5] px-4 py-2.5 text-white",
                    compact ? "text-[12px]" : "text-[13px]",
                  )}
                >
                  <p>{msg.text}</p>
                </div>
              ) : null}
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
