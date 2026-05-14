import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import {
  type AgentBlock,
  type ChatAttachment,
  type ChatMsg,
} from "./types";

const TICKET_ID_RE =
  /\*{0,2}Ticket\s+ID:?\*{0,2}\s*\*{0,2}([A-Z0-9-]{4,})\*{0,2}(?=\s|$|[^A-Za-z0-9-])/i;

function extractTicketId(text: string) {
  const match = text.match(TICKET_ID_RE);
  if (!match || match.index === undefined) return null;

  return {
    before: text.slice(0, match.index).replace(/\s+$/, ""),
    ticketId: match[1],
    after: text.slice(match.index + match[0].length).replace(/^\s+/, ""),
  };
}

function TicketBadge({ ticketId }: { ticketId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticketId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — ignore silently.
    }
  };

  return (
    <div className="my-2 flex items-center justify-between gap-3 rounded-2xl border border-[#006BE5]/15 bg-white px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#006BE5]/10">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-3.5 w-3.5 text-[#006BE5]"
            aria-hidden="true"
          >
            <path
              d="M4 10.5l3.5 3.5L16 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold tracking-[0.12em] text-[#006BE5]/70 uppercase">
            Ticket ID
          </p>
          <p className="truncate font-mono text-[13px] font-bold text-[#006BE5]">
            {ticketId}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-full border border-[#006BE5]/20 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[#006BE5] uppercase transition-colors hover:bg-[#006BE5]/5"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

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
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  footer?: React.ReactNode;
  compact?: boolean;
}

interface AgentMessageProps {
  msg: ChatMsg;
  compact: boolean;
  onTypingTick?: () => void;
}

function useTypewriter(target: string, onTick?: () => void) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const targetLength = target.length;
  // Depend on the boolean rather than `displayedLength` so the interval is
  // only torn down on the catch-up/grow transitions, not every tick.
  const needsTyping = displayedLength < targetLength;

  useEffect(() => {
    if (!needsTyping) return;
    const id = window.setInterval(() => {
      setDisplayedLength((prev) => {
        if (prev >= targetLength) return prev;
        const remaining = targetLength - prev;
        const charsPerTick = Math.max(1, Math.ceil(remaining / 50));
        const next = Math.min(prev + charsPerTick, targetLength);
        onTickRef.current?.();
        return next;
      });
    }, 18);
    return () => window.clearInterval(id);
  }, [needsTyping, targetLength]);

  return {
    displayText: target.slice(0, displayedLength),
    isTyping: needsTyping,
  };
}

function StageBlock({
  content,
  isActive,
  compact,
  onTypingTick,
}: {
  content: string;
  isActive: boolean;
  compact: boolean;
  onTypingTick?: () => void;
}) {
  const { displayText, isTyping } = useTypewriter(content, onTypingTick);
  const showSpinner = isActive || isTyping;

  return (
    <div
      className={cn(
        "font-mono flex items-center gap-2 tracking-[0.04em] text-[#000000] uppercase",
        compact ? "text-[11px]" : "text-[12px]",
        showSpinner ? "opacity-90" : "opacity-50",
      )}
    >

      <span className="truncate">{displayText}</span>
    </div>
  );
}

function TextBlock({
  content,
  isActive,
  compact,
  onTypingTick,
}: {
  content: string;
  isActive: boolean;
  compact: boolean;
  onTypingTick?: () => void;
}) {
  const { displayText, isTyping } = useTypewriter(content, onTypingTick);
  // Hold the ticket badge until the full message is in — extracting from a
  // partial string would flash partial IDs.
  const settled = !isTyping && !isActive;
  const parts = settled ? extractTicketId(displayText) : null;

  return (
    <div
      className={cn(
        "font-sans min-w-0 max-w-full rounded-[24px] bg-[#F2F8FF] px-4 py-2.5 text-[#006BE5] [overflow-wrap:anywhere]",
        compact
          ? "text-[13px] leading-relaxed"
          : "text-[14px] leading-relaxed",
      )}
    >
      {parts ? (
        <>
          {parts.before && (
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {parts.before}
            </ReactMarkdown>
          )}
          <TicketBadge ticketId={parts.ticketId} />
          {parts.after && (
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {parts.after}
            </ReactMarkdown>
          )}
        </>
      ) : (
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>
          {displayText}
        </ReactMarkdown>
      )}
    </div>
  );
}

const AgentMessage = memo(function AgentMessage({
  msg,
  compact,
  onTypingTick,
}: AgentMessageProps) {
  const blocks: AgentBlock[] =
    msg.blocks && msg.blocks.length > 0
      ? msg.blocks
      : msg.text
        ? [{ kind: "text", content: msg.text }]
        : [];
  const lastIndex = blocks.length - 1;

  return (
    <div className="flex max-w-[90%] min-w-0 flex-col items-start gap-2">
      {blocks.map((block, i) => {
        const isActive = !!msg.pending && i === lastIndex;
        const key = `${i}-${block.kind}`;
        return block.kind === "stage" ? (
          <StageBlock
            key={key}
            content={block.content}
            isActive={isActive}
            compact={compact}
            onTypingTick={onTypingTick}
          />
        ) : (
          <TextBlock
            key={key}
            content={block.content}
            isActive={isActive}
            compact={compact}
            onTypingTick={onTypingTick}
          />
        );
      })}
    </div>
  );
});

function attachmentLabel(file: ChatAttachment) {
  if (file.kind === "pdf") return "PDF";

  return file.name.split(".").pop()?.slice(0, 3).toUpperCase() || "IMG";
}

export function ChatMessageList({
  messages,
  chatEndRef,
  footer,
  compact = false,
}: ChatMessageListProps) {
  const scrollPendingRef = useRef(false);
  // Stable identity so memo'd <AgentMessage> doesn't re-render on every
  // parent render; rAF-coalesced so N concurrent typewriters scroll once
  // per frame instead of N times.
  const handleTypingTick = useCallback(() => {
    if (scrollPendingRef.current) return;
    scrollPendingRef.current = true;
    requestAnimationFrame(() => {
      scrollPendingRef.current = false;
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [chatEndRef]);

  return (
    <div className="flex min-h-full flex-col">
      {messages.map((msg, index) => (
        <div
          key={msg.id}
          className={cn(
            "flex w-full",
            index > 0 && "mt-8",
            msg.sender === "user" ? "justify-end" : "justify-start",
          )}
        >
          {msg.sender === "agent" && (msg.text || msg.blocks?.length) ? (
            <AgentMessage
              msg={msg}
              compact={compact}
              onTypingTick={handleTypingTick}
            />
          ) : (
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
                    "min-w-0 max-w-full rounded-[24px] bg-[#006BE5] px-4 py-2.5 text-white",
                    compact ? "text-[12px]" : "text-[13px]",
                  )}
                >
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {msg.text}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}

      {footer ? <div className="mt-auto">{footer}</div> : null}

      {/* Bottom scroll anchor */}
      <div ref={chatEndRef} className={compact ? "h-1 w-full" : "h-2 w-full"} />
    </div>
  );
}
