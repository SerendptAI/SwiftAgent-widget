import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import {
  type AgentBlock,
  type ChatAttachment,
  type ChatMsg,
  type NavigationHighlight,
  type NavigationStep,
} from "./types";

export interface ImageViewerOptions {
  src: string;
  alt?: string;
  highlight?: NavigationHighlight;
  naturalDims?: { w: number; h: number };
}
export type ImageViewer = (opts: ImageViewerOptions) => void;
export const ImageViewerContext = createContext<ImageViewer | null>(null);

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
  chatScrollRef?: React.RefObject<HTMLDivElement | null>;
  stickToBottomRef?: React.RefObject<boolean>;
  compact?: boolean;
  hasRevealed?: (id: number) => boolean;
  markRevealed?: (id: number) => void;
  companyName?: string;
  companyLogoUrl?: string;
}

const ALWAYS_ANIMATE = () => false;
const IGNORE_REVEAL = () => {};

interface AgentMessageProps {
  msg: ChatMsg;
  compact: boolean;
  onTypingTick?: () => void;
  hasRevealed: (id: number) => boolean;
  markRevealed: (id: number) => void;
}

function useTypewriter(
  target: string,
  { revealed = false, onTick }: { revealed?: boolean; onTick?: () => void } = {},
) {
  // When the message has already been revealed (e.g. the widget was closed and
  // reopened), start fully typed so the typewriter doesn't replay. `revealed`
  // is only read on mount — later flips never restart or snap the animation.
  const [displayedLength, setDisplayedLength] = useState(() =>
    revealed ? target.length : 0,
  );
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const targetLength = target.length;
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

export const TICKET_STAGE_RE = /(creating.*ticket|ticket.*(created|success))/i;
export const TICKET_CREATED_RE = /ticket.*(created|success)/i;

function formatDuration(ms: number) {
  if (ms < 1000) return "<1s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin === 0 ? `${hr}h` : `${hr}h ${remMin}m`;
}

function DurationLabel({ ms, compact }: { ms: number; compact: boolean }) {
  return (
    <div
      className={cn(
        "font-mono flex items-center gap-1.5 text-black/60 uppercase",
        compact ? "text-[11px]" : "text-[12px]",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 shrink-0"
        aria-hidden="true"
      >
        <path
          d="M10 1.33333H6.66667"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.66667 9C2.66667 5.87039 5.20372 3.33333 8.33333 3.33333C9.89813 3.33333 11.3148 3.96759 12.3403 4.99306M12.3403 4.99306C13.3657 6.01853 14 7.4352 14 9C14 12.1296 11.4629 14.6667 8.33333 14.6667H2M12.3403 4.99306L13.3333 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.33333 12.6667H2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 10.6667H2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.33333 9L10.6667 6.66667"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{formatDuration(ms)}</span>
    </div>
  );
}

function TicketLifecyclePill({
  rawContent,
  active,
  onTypingTick,
  revealed = false,
}: {
  rawContent: string;
  active: boolean;
  onTypingTick?: () => void;
  revealed?: boolean;
}) {
  const created = TICKET_CREATED_RE.test(rawContent);
  const target = created ? "Ticket created" : "Creating ticket...";
  const { displayText } = useTypewriter(target, { revealed, onTick: onTypingTick });
  const gradId = `ticket-spin-${useId().replace(/:/g, "")}`;

  return (
    <div className="font-sans inline-flex h-11 items-center gap-2 rounded-3xl bg-[#F6F6F6] px-4 py-2.5">
      {created ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#15A05A] text-white">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="size-3"
            aria-hidden="true"
          >
            <path
              d="M5 10.5l3.5 3.5L15 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <svg
          viewBox="0 0 20 20"
          className={cn("size-5 shrink-0", active && "animate-spin")}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F25430" />
              <stop offset="50%" stopColor="#F2B035" />
              <stop offset="100%" stopColor="#FFD700" />
            </linearGradient>
          </defs>
          <circle
            cx="10"
            cy="10"
            r="7.5"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="28 18"
          />
        </svg>
      )}
      <span className="text-[14px] leading-6 font-medium text-[#7E7E7E]">
        {displayText}
      </span>
    </div>
  );
}

function StageBlock({
  content,
  isActive,
  compact,
  onTypingTick,
  revealed = false,
}: {
  content: string;
  isActive: boolean;
  compact: boolean;
  onTypingTick?: () => void;
  revealed?: boolean;
}) {
  if (TICKET_STAGE_RE.test(content)) {
    return (
      <TicketLifecyclePill
        rawContent={content}
        active={isActive}
        onTypingTick={onTypingTick}
        revealed={revealed}
      />
    );
  }

  return (
    <SwapStageText
      content={content}
      isActive={isActive}
      compact={compact}
      revealed={revealed}
    />
  );
}

function SwapStageText({
  content,
  isActive,
  compact,
  revealed = false,
}: {
  content: string;
  isActive: boolean;
  compact: boolean;
  revealed?: boolean;
}) {
  const [shown, setShown] = useState(content);
  // Already-revealed stages (e.g. after reopening the widget) start visible so
  // they don't replay the fade-in.
  const [visible, setVisible] = useState(revealed);

  // Fade in on mount.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (content === shown) return;
    setVisible(false);
    const t = window.setTimeout(() => {
      setShown(content);
      setVisible(true);
    }, 180);
    return () => window.clearTimeout(t);
  }, [content, shown]);

  return (
    <div
      className={cn(
        "font-mono flex items-center gap-2 pl-4 uppercase transition-opacity duration-200 ease-out",
        isActive ? "text-black" : "text-black/60",
        compact ? "text-[11px]" : "text-[12px]",
      )}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span
        className={cn(
          "truncate",
          isActive && "widget-stage-shimmer",
        )}
      >
        {shown}
      </span>
    </div>
  );
}

/** Brief "typing dots" warmup shown before a TextBlock starts typewriting —
 *  fires both for the initial widget welcome text and for the text that
 *  follows a thinking/stage block in a streamed response. Skipped when the
 *  message was already fully revealed (close → reopen). */
const TEXT_BLOCK_WARMUP_MS = 700;

/** iMessage-style tail hanging off a bubble's bottom outer corner.
 *  Side-specific paths (from the Figma asset) instead of a CSS mirror —
 *  the widget's Tailwind build doesn't ship negative scale utilities. */
const TAIL_PATHS = {
  left: "M24 0V4C24 12 20 18 14 22C8 26 2 28 0 28C4 26 8 22 11 18C14 14 16 8 16 0H24Z",
  right: "M0 0V4C0 12 4 18 10 22C16 26 22 28 24 28C20 26 16 22 13 18C10 14 8 8 8 0H0Z",
} as const;

function BubbleTail({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 28"
      aria-hidden="true"
      fill="currentColor"
      className={cn(
        "absolute bottom-[-11px] h-[28px] w-[24px]",
        side === "left"
          ? "left-[-8px] text-[#F2F8FF]"
          : "right-[-8px] text-[#006BE5]",
      )}
    >
      <path d={TAIL_PATHS[side]} />
    </svg>
  );
}

function TextBlock(props: {
  content: string;
  isActive: boolean;
  compact: boolean;
  onTypingTick?: () => void;
  revealed?: boolean;
  tail?: boolean;
}) {
  const { revealed = false, compact } = props;
  const [warming, setWarming] = useState(!revealed);

  useEffect(() => {
    if (!warming) return;
    const id = window.setTimeout(
      () => setWarming(false),
      TEXT_BLOCK_WARMUP_MS,
    );
    return () => window.clearTimeout(id);
  }, [warming]);

  if (warming) return <TypingBubble compact={compact} />;
  return <TextBlockBody {...props} />;
}

function TextBlockBody({
  content,
  isActive,
  compact,
  onTypingTick,
  revealed = false,
  tail = false,
}: {
  content: string;
  isActive: boolean;
  compact: boolean;
  onTypingTick?: () => void;
  revealed?: boolean;
  tail?: boolean;
}) {
  const { displayText, isTyping } = useTypewriter(content, {
    revealed,
    onTick: onTypingTick,
  });
 
  const settled = !isTyping && !isActive;
  const parts = settled ? extractTicketId(displayText) : null;

  return (
    <div
      className={cn(
        "font-sans relative min-w-0 max-w-full rounded-3xl bg-[#F2F8FF] px-4 py-2.5 text-[#006BE5] wrap-anywhere",
        compact ? "text-[13px] leading-[22px]" : "text-[14px] leading-6",
      )}
    >
      {tail && <BubbleTail side="left" />}
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

export function HighlightOverlay({
  highlight,
  imgW,
  imgH,
}: {
  highlight: NavigationHighlight;
  imgW: number;
  imgH: number;
}) {
  const reactId = useId().replace(/:/g, "");
  const maskId = `spot-${reactId}`;
  const arrowId = `arrow-${reactId}`;

  // Padded rectangle around the bbox so the spotlight breathes a bit around
  // small targets like buttons.
  const padX = Math.max(highlight.w * 0.08, 6);
  const padY = Math.max(highlight.h * 0.18, 6);
  const rectX = Math.max(highlight.x - padX, 0);
  const rectY = Math.max(highlight.y - padY, 0);
  const rectW = Math.min(highlight.w + padX * 2, imgW - rectX);
  const rectH = Math.min(highlight.h + padY * 2, imgH - rectY);
  const cx = rectX + rectW / 2;
  const cy = rectY + rectH / 2;
  const cornerR = Math.min(8, Math.min(rectW, rectH) * 0.18);

  // Pick whichever corner is farther from the target so the arrow doesn't
  // start off-image. Default origin is upper-right.
  const fromRight = cx < imgW * 0.55;
  const sideX = fromRight ? rectX + rectW + 12 : rectX - 12;
  const endY = cy;
  const startX = fromRight
    ? Math.min(sideX + Math.min(110, imgW * 0.22), imgW - 12)
    : Math.max(sideX - Math.min(110, imgW * 0.22), 12);
  const startY = Math.max(cy - Math.min(90, imgH * 0.35), 12);
  const ctrlX = (startX + sideX) / 2 + (fromRight ? 12 : -12);
  const ctrlY = startY + (endY - startY) * 0.45;

  const strokeW = Math.max(2, Math.min(3.5, imgW / 240));

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${imgW} ${imgH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width={imgW} height={imgH} fill="white" />
          <rect
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            rx={cornerR}
            ry={cornerR}
            fill="black"
          />
        </mask>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="white" />
        </marker>
      </defs>
      <rect
        width={imgW}
        height={imgH}
        fill="rgba(0,0,0,0.45)"
        mask={`url(#${maskId})`}
      />
      <path
        d={`M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${sideX} ${endY}`}
        stroke="white"
        strokeWidth={strokeW}
        strokeLinecap="round"
        fill="none"
        markerEnd={`url(#${arrowId})`}
      />
    </svg>
  );
}

function NavigationStepCard({
  step,
  compact,
}: {
  step: NavigationStep;
  compact: boolean;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const highlight = step.highlight;
  const viewImage = useContext(ImageViewerContext);

  // Cached images may skip onLoad — read dimensions on mount if already complete.
  useEffect(() => {
    if (dims) return;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setDims({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [dims, step.screenshot_url]);

  const showHighlight =
    !!highlight && !!dims && dims.w > 0 && dims.h > 0;

  return (
    <div className="font-sans flex w-full flex-col gap-2">
      {step.page_title ? (
        <div
          className={cn(
            "font-mono flex items-center gap-1.5 text-[#006BE5] uppercase",
            compact ? "text-[11px]" : "text-[12px]",
          )}
        >
          <span className="truncate">{step.page_title}</span>
          <span aria-hidden="true">›</span>
        </div>
      ) : null}
      {step.screenshot_url ? (
        <button
          type="button"
          onClick={() =>
            viewImage?.({
              src: step.screenshot_url!,
              alt: `Step ${step.step}`,
              highlight,
              naturalDims: dims ?? undefined,
            })
          }
          className="group relative block w-full cursor-zoom-in overflow-hidden rounded-[10px] bg-white text-left"
          aria-label={`View screenshot for step ${step.step}`}
        >
          <img
            ref={imgRef}
            src={step.screenshot_url}
            alt={`Step ${step.step}`}
            className="block h-auto w-full"
            onLoad={(e) => {
              const target = e.currentTarget;
              setDims({
                w: target.naturalWidth,
                h: target.naturalHeight,
              });
            }}
          />
          {showHighlight && highlight ? (
            <HighlightOverlay
              highlight={highlight}
              imgW={dims!.w}
              imgH={dims!.h}
            />
          ) : null}
          <span className="pointer-events-none absolute top-[7px] right-[7px] flex h-[33px] w-[33px] items-center justify-center rounded-full bg-white/90 text-black shadow-[0_2px_6px_rgba(0,0,0,0.12)] backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-white">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M4 7.5V5.5A1.5 1.5 0 0 1 5.5 4h2M12.5 4h2A1.5 1.5 0 0 1 16 5.5v2M16 12.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M7.5 16h-2A1.5 1.5 0 0 1 4 14.5v-2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      ) : null}

      {step.instruction ? (
        <p
          className={cn(
            "text-[#0F1626]/80 wrap-anywhere",
            compact ? "text-[12px] leading-snug" : "text-[13px] leading-relaxed",
          )}
        >
          {step.instruction}
        </p>
      ) : null}
    </div>
  );
}

function NavigationBlock({
  steps,
  compact,
}: {
  steps: NavigationStep[];
  pathSummary?: string[];
  compact: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {steps.map((step, i) => (
        <NavigationStepCard
          key={`${step.step}-${i}`}
          step={step}
          compact={compact}
        />
      ))}
    </div>
  );
}

const AgentMessage = memo(function AgentMessage({
  msg,
  compact,
  onTypingTick,
  hasRevealed,
  markRevealed,
}: AgentMessageProps) {
  const blocks: AgentBlock[] =
    msg.blocks && msg.blocks.length > 0
      ? msg.blocks
      : msg.text
        ? [{ kind: "text", content: msg.text }]
        : [];
  const lastIndex = blocks.length - 1;

  // Captured once at mount: was this message already fully revealed before this
  // mount? If so, its blocks render instantly instead of re-animating.
  const revealed = useRef(hasRevealed(msg.id)).current;

  // Once the response is no longer streaming, record it as revealed so a future
  // remount (close → reopen) shows it fully typed rather than replaying.
  useEffect(() => {
    if (!msg.pending) markRevealed(msg.id);
  }, [msg.pending, msg.id, markRevealed]);

  const showDuration =
    !msg.pending && typeof msg.durationMs === "number" && msg.durationMs > 0;

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-3">
      {showDuration ? (
        <DurationLabel ms={msg.durationMs!} compact={compact} />
      ) : null}
      {blocks.map((block, i) => {
        const isActive = !!msg.pending && i === lastIndex;
        const key = `${i}-${block.kind}`;
        if (block.kind === "stage") {
          return (
            <StageBlock
              key={key}
              content={block.content}
              isActive={isActive}
              compact={compact}
              onTypingTick={onTypingTick}
              revealed={revealed}
            />
          );
        }
        if (block.kind === "navigation") {
          return (
            <NavigationBlock
              key={key}
              steps={block.guide.steps}
              pathSummary={block.guide.path_summary}
              compact={compact}
            />
          );
        }
        return (
          <TextBlock
            key={key}
            content={block.content}
            isActive={isActive}
            compact={compact}
            onTypingTick={onTypingTick}
            revealed={revealed}
            tail={i === lastIndex}
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

/** Compact 4-dot wave bubble shown while an agent text block is warming up.
 *  Same bubble style/colors as the real text reply, just smaller. */
function TypingBubble({ compact }: { compact: boolean }) {
  const dotSize = compact ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <div className="flex max-w-[90%] min-w-0 flex-col items-start">
      <div
        role="status"
        aria-label="Agent is typing"
        className={cn(
          "font-sans inline-flex items-center gap-1 rounded-full bg-[#F2F8FF]",
          compact ? "px-2.5 py-1.5" : "px-3 py-2",
        )}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "widget-typing-dot rounded-full bg-[#006BE5]",
              dotSize,
            )}
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function formatMessageDateTime(msg: ChatMsg): string {
  if (!msg.createdAt) return msg.time ?? "";
  const d = new Date(msg.createdAt);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString([], {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
  return `${time} ${date}`;
}

function formatClockTime(msg: ChatMsg): string {
  if (msg.createdAt) {
    return new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return msg.time ?? "";
}

function MessageAvatar({
  src,
  name,
  compact,
}: {
  src?: string;
  name?: string;
  compact: boolean;
}) {
  const initial = name?.trim().charAt(0).toUpperCase() || "";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        compact ? "h-7 w-7" : "h-8 w-8",
        src ? "bg-white" : "bg-[#6433CC]",
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-sans text-[13px] font-bold text-white">
          {initial}
        </span>
      )}
    </span>
  );
}

const TIMESTAMP_CLASS = "font-mono text-[11px] tracking-wide text-black/40";

function DoubleCheck() {
  return (
    <svg
      viewBox="0 0 22 14"
      fill="none"
      className="h-3 w-4 shrink-0"
      aria-hidden="true"
    >
      <path
        d="M1 7.5l3.3 3.3L11 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 10.3L10 10.8 17 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatMessageList({
  messages,
  chatEndRef,
  chatScrollRef,
  stickToBottomRef,
  compact = false,
  hasRevealed = ALWAYS_ANIMATE,
  markRevealed = IGNORE_REVEAL,
  companyName,
  companyLogoUrl,
}: ChatMessageListProps) {
  const scrollPendingRef = useRef(false);
  const viewImage = useContext(ImageViewerContext);

  // Stable identity so memo'd <AgentMessage> doesn't re-render on every
  // parent render; rAF-coalesced so N concurrent typewriters scroll once
  // per frame instead of N times. Skips entirely once the user has scrolled
  // up so streamed ticks don't yank them back to the bottom.
  const handleTypingTick = useCallback(() => {
    if (stickToBottomRef && !stickToBottomRef.current) return;
    if (scrollPendingRef.current) return;
    scrollPendingRef.current = true;
    requestAnimationFrame(() => {
      scrollPendingRef.current = false;
      if (stickToBottomRef && !stickToBottomRef.current) return;
      const scrollContainer = chatScrollRef?.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        return;
      }

      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [chatEndRef, chatScrollRef, stickToBottomRef]);

  return (
    <div className="flex min-h-full flex-col">
      {messages.map((msg, index) => {
        const rowMargin = index > 0 ? "mt-8" : "";

        if (msg.sender === "agent") {
          const hasContent = !!(msg.text || msg.blocks?.length);
          if (!hasContent && !msg.pending) return null;
          return (
            <div
              key={msg.id}
              className={cn("flex w-full justify-start", rowMargin)}
            >
              <div className="flex w-full max-w-[90%] min-w-0 flex-col items-start gap-1.5">
                {msg.agentName ? (
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      compact ? "pl-9" : "pl-10",
                    )}
                  >
                    <span className="font-sans text-[13px] font-semibold text-black">
                      {msg.agentName}
                    </span>
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt={companyName ?? ""}
                        className="h-4 w-4 shrink-0 rounded-[3px] object-cover"
                      />
                    ) : null}
                  </span>
                ) : null}
                <div className="flex w-full min-w-0 items-end gap-2">
                  <MessageAvatar
                    src={msg.agentAvatarUrl ?? companyLogoUrl}
                    name={msg.agentName ?? companyName}
                    compact={compact}
                  />
                  {hasContent ? (
                    <AgentMessage
                      msg={msg}
                      compact={compact}
                      onTypingTick={handleTypingTick}
                      hasRevealed={hasRevealed}
                      markRevealed={markRevealed}
                    />
                  ) : (
                    <TypingBubble compact={compact} />
                  )}
                </div>
                {!msg.pending && hasContent && (msg.createdAt || msg.time) ? (
                  <span
                    className={cn(TIMESTAMP_CLASS, compact ? "pl-13" : "pl-14")}
                  >
                    {formatMessageDateTime(msg)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={cn("flex w-full justify-end", rowMargin)}
          >
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
                      <button
                        type="button"
                        key={file.id}
                        onClick={() =>
                          viewImage?.({ src: file.url, alt: file.name })
                        }
                        className="cursor-zoom-in"
                        aria-label={`View ${file.name}`}
                      >
                        <img
                          src={file.url}
                          alt={file.name}
                          className="max-h-40 w-56 rounded-lg object-cover"
                        />
                      </button>
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
                    "relative min-w-0 max-w-full rounded-3xl bg-[#006BE5] px-4 py-2.5 text-white",
                    compact ? "text-[13px] leading-[22px]" : "text-[14px] leading-6",
                  )}
                >
                  <BubbleTail side="right" />
                  <p className="whitespace-pre-wrap wrap-anywhere">
                    {msg.text}
                  </p>
                </div>
              ) : null}

              {msg.createdAt || msg.time ? (
                <span
                  className={cn(TIMESTAMP_CLASS, "mt-1 flex items-center gap-1 pr-4")}
                >
                  Sent
                  <DoubleCheck />
                  {formatClockTime(msg)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Bottom scroll anchor */}
      <div ref={chatEndRef} className={compact ? "h-1 w-full" : "h-2 w-full"} />
    </div>
  );
}
