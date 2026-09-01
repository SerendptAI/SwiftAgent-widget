import "./widget.css";

import { ChevronDown, SquarePen } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { BriggsFace } from "./components/BriggsFace";
import { ChatInput } from "./components/ChatInput";
import {
  ChatMessageList,
  HighlightOverlay,
  type ImageViewer,
  ImageViewerContext,
  type ImageViewerOptions,
} from "./components/ChatMessageList";
import { ChatSkeleton } from "./components/ChatSkeleton";
import { usePublicCompanyQuery } from "./hooks/use-public-company";
import { useVisitorLog } from "./hooks/use-visitor-log";
import { useWebMCP } from "./hooks/use-webmcp";
import { useWidgetChat } from "./hooks/use-widget-chat";
import { initApiClients } from "./lib/api-client";
import { cn } from "./lib/cn";
import { WIDGET_SCRIPT_SELECTOR } from "./lib/widget-asset-url";

// --- Main Widget Component ---

export type WidgetMode = "widget" | "button";

const LAUNCHER_SIZE = 72;
const LAUNCHER_MARGIN = 30;
const LAUNCHER_DRAG_THRESHOLD = 6;
const LAUNCHER_POS_KEY = "swift-agent-widget-launcher-pos";

type LauncherRest = { side: "left" | "right"; bottom: number };

function loadLauncherRest(): LauncherRest {
  const fallback: LauncherRest = { side: "right", bottom: LAUNCHER_MARGIN };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LAUNCHER_POS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LauncherRest>;
    if (
      (parsed.side === "left" || parsed.side === "right") &&
      typeof parsed.bottom === "number" &&
      Number.isFinite(parsed.bottom)
    ) {
      return { side: parsed.side, bottom: parsed.bottom };
    }
  } catch {
    // Ignore malformed/unavailable storage and fall back to the default corner.
  }
  return fallback;
}

function WidgetContent({
  companyId,
  mode,
}: {
  companyId: string;
  mode: WidgetMode;
}) {
  const { data: company, isLoading: companyLoading } =
    usePublicCompanyQuery(companyId);
  const companyName = company?.name;

  const [chatOpen, setChatOpen] = useState(false);

  const chat = useWidgetChat({ companyId, enabled: chatOpen });

  useVisitorLog(companyId);
  useWebMCP();

  const containerRef = useRef<HTMLDivElement>(null);
  // True while the user is parked at (or near) the bottom of the message list.
  // Auto-scroll only nudges to the bottom while this holds, so scrolling up to
  // read earlier messages isn't yanked back down on every streamed tick.
  const stickToBottomRef = useRef(true);

  // Expose chat-open control to the module-level API so host pages can
  // trigger the chat from any element via SwiftAgentWidget.open/close/toggle.
  useEffect(() => {
    chatOpenSetterRef = setChatOpen;
    return () => {
      chatOpenSetterRef = null;
    };
  }, []);

  // Close chat on Escape key (accessibility: keyboard alternative to clicking backdrop)
  useEffect(() => {
    if (!chatOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen]);

  // Lock the host page scroll while the chat is open, especially for iOS Safari.
  useEffect(() => {
    if (!chatOpen) return;

    const scrollY = window.scrollY;
    const { body, documentElement } = document;
    const previousBodyStyles = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    };
    const previousHtmlOverflow = documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.left = "0";
    body.style.right = scrollbarWidth > 0 ? `${scrollbarWidth}px` : "0";
    body.style.top = `-${scrollY}px`;
    body.style.width = "auto";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.left = previousBodyStyles.left;
      body.style.overflow = previousBodyStyles.overflow;
      body.style.position = previousBodyStyles.position;
      body.style.right = previousBodyStyles.right;
      body.style.top = previousBodyStyles.top;
      body.style.width = previousBodyStyles.width;
      documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [chatOpen]);

  // iOS Safari's visible viewport changes as browser chrome and the keyboard
  // move. Keep the fullscreen widget sized to the real visible area so the
  // message pane remains scrollable instead of being clipped below the fold.
  useEffect(() => {
    if (!chatOpen) return;

    const host = document.getElementById(WIDGET_HOST_ID);
    const container = containerRef.current;

    let keyboardInset = 0;
    const FALLBACK_KEYBOARD_FRACTION = 0.42;

    const applyHeight = (height: number) => {
      host?.style.setProperty("--swift-widget-viewport-height", `${height}px`);
      if (container) {
        container.style.height = `${height}px`;
        container.style.bottom = "auto";
      }
    };

    const applyViewport = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const inset = window.innerHeight - height;
      if (inset > 1) keyboardInset = inset;
      applyHeight(height);

      if (container) {
        const offsetTop = vv?.offsetTop ?? 0;
        const offsetLeft = vv?.offsetLeft ?? 0;
        container.style.transform =
          offsetTop || offsetLeft
            ? `translate(${offsetLeft}px, ${offsetTop}px)`
            : "";
      }
    };

    // Pre-shrink on focus so the input clears the keyboard's landing zone before
    // it animates in, so iOS never scrolls the page up to reveal it.
    const onFocusIn = () => {
      const inset =
        keyboardInset || window.innerHeight * FALLBACK_KEYBOARD_FRACTION;
      applyHeight(window.innerHeight - inset);
    };

    let rafId = 0;
    let trackUntil = 0;
    const tick = () => {
      applyViewport();
      if (performance.now() < trackUntil) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };
    const track = () => {
      trackUntil = performance.now() + 500;
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    applyViewport();
    window.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", track);
    window.visualViewport?.addEventListener("scroll", track);
    window.addEventListener("resize", track);
    window.addEventListener("orientationchange", track);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", track);
      window.visualViewport?.removeEventListener("scroll", track);
      window.removeEventListener("resize", track);
      window.removeEventListener("orientationchange", track);
      host?.style.removeProperty("--swift-widget-viewport-height");
      if (container) {
        container.style.height = "";
        container.style.bottom = "";
        container.style.transform = "";
      }
    };
  }, [chatOpen]);

  // Track whether the user is parked near the bottom. Once they scroll up,
  // stickToBottom flips off and auto-scroll stops fighting them.
  useEffect(() => {
    if (!chatOpen) return;
    const scrollContainer = chat.chatScrollRef.current;
    if (!scrollContainer) return;

    const onScroll = () => {
      const distance =
        scrollContainer.scrollHeight -
        scrollContainer.scrollTop -
        scrollContainer.clientHeight;
      stickToBottomRef.current = distance < 80;
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, [chatOpen, chat.chatScrollRef]);

  useEffect(() => {
    if (!chatOpen) return;

    // A message the user just sent always pulls the view back to the bottom;
    // an incoming agent message only does so if they were already there.
    const lastMessage = chat.chatMessages[chat.chatMessages.length - 1];
    if (lastMessage?.sender === "user") stickToBottomRef.current = true;
    if (!stickToBottomRef.current) return;

    const frame = requestAnimationFrame(() => {
      const scrollContainer = chat.chatScrollRef.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [chat.chatMessages.length, chat.chatScrollRef, chatOpen]);

  const bubbleQuestions = useMemo(() => {
    // Company can turn suggestions off entirely from the dashboard.
    if (company?.enable_suggested_prompts === false) return [];
    const configured = company?.suggested_ai_prompts?.filter(
      (q): q is string => typeof q === "string" && q.trim().length > 0,
    );
    if (configured && configured.length > 0) return configured;
    return [
      `What is ${companyName || "this company"} about?`,
      "How can I use it?",
      "Do you have a starter plan?",
    ];
  }, [
    company?.suggested_ai_prompts,
    company?.enable_suggested_prompts,
    companyName,
  ]);

  // Assistance pill visibility — appears in bursts with pauses so it draws
  // attention without permanently occupying the corner.
  const [pillVisible, setPillVisible] = useState(false);
  const [pillLeaving, setPillLeaving] = useState(false);
  useEffect(() => {
    if (chatOpen) {
      setPillVisible(false);
      return;
    }

    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        if (cancelled) clearTimeout(t);
      });

    const run = async () => {
      await wait(3000);

      while (!cancelled) {
        setPillLeaving(false);
        setPillVisible(true);
        await wait(6000);

        setPillLeaving(true);
        await wait(300);
        setPillVisible(false);
        setPillLeaving(false);

        await wait(7000);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [chatOpen]);

  // Draggable launcher — users can reposition the floating button; it snaps to
  // the nearest horizontal edge on release and persists across reloads.
  const [launcherRest, setLauncherRest] = useState<LauncherRest>(loadLauncherRest);
  const [launcherDrag, setLauncherDrag] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const launcherDragRef = useRef<{
    px: number;
    py: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressLauncherClickRef = useRef(false);

  // Keep the resting position on-screen if the viewport shrinks below it.
  useEffect(() => {
    const onResize = () => {
      setLauncherRest((prev) => {
        const maxBottom =
          window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN;
        const bottom = Math.min(
          prev.bottom,
          Math.max(LAUNCHER_MARGIN, maxBottom),
        );
        return bottom === prev.bottom ? prev : { ...prev, bottom };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleLauncherPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      launcherDragRef.current = {
        px: e.clientX,
        py: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleLauncherPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const start = launcherDragRef.current;
      if (!start) return;
      const dx = e.clientX - start.px;
      const dy = e.clientY - start.py;
      if (!start.moved && Math.hypot(dx, dy) < LAUNCHER_DRAG_THRESHOLD) return;
      start.moved = true;
      const maxLeft = window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN;
      const maxTop = window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN;
      const left = Math.min(
        Math.max(start.left + dx, LAUNCHER_MARGIN),
        Math.max(LAUNCHER_MARGIN, maxLeft),
      );
      const top = Math.min(
        Math.max(start.top + dy, LAUNCHER_MARGIN),
        Math.max(LAUNCHER_MARGIN, maxTop),
      );
      setLauncherDrag({ left, top });
    },
    [],
  );

  const endLauncherDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const start = launcherDragRef.current;
      launcherDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!start?.moved) {
        setLauncherDrag(null);
        return;
      }
      // Suppress the click that fires after a drag so the chat doesn't toggle.
      suppressLauncherClickRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const side =
        rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
      const maxBottom = window.innerHeight - rect.height - LAUNCHER_MARGIN;
      const bottom = Math.min(
        Math.max(window.innerHeight - rect.bottom, LAUNCHER_MARGIN),
        Math.max(LAUNCHER_MARGIN, maxBottom),
      );
      const next: LauncherRest = { side, bottom };
      setLauncherRest(next);
      setLauncherDrag(null);
      try {
        window.localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable (private mode); position stays for the session.
      }
    },
    [],
  );

  const handleLauncherPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      launcherDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setLauncherDrag(null);
    },
    [],
  );

  const handleLauncherClick = useCallback(() => {
    if (suppressLauncherClickRef.current) {
      suppressLauncherClickRef.current = false;
      return;
    }
    setChatOpen((o) => !o);
  }, []);

  const launcherStyle: React.CSSProperties = launcherDrag
    ? { left: launcherDrag.left, top: launcherDrag.top }
    : launcherRest.side === "left"
      ? { left: LAUNCHER_MARGIN, bottom: launcherRest.bottom }
      : { right: LAUNCHER_MARGIN, bottom: launcherRest.bottom };

  const initial = companyName ? companyName.charAt(0).toUpperCase() : "";
  const displayName = companyName || "";

  // Image lightbox state — lifted here (rather than inside ChatMessageList)
  // so the overlay renders outside the chat panel, which uses transform via
  // widget-slide-up and would otherwise act as the containing block for
  // fixed-positioned descendants, clipping the overlay to the panel.
  const [viewedImage, setViewedImage] = useState<ImageViewerOptions | null>(
    null,
  );
  const openImage = useCallback<ImageViewer>((opts) => {
    setViewedImage(opts);
  }, []);
  const closeImage = useCallback(() => setViewedImage(null), []);

  useEffect(() => {
    if (!viewedImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeImage();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewedImage, closeImage]);

  return (
    <ImageViewerContext.Provider value={openImage}>
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col items-end justify-end font-sans pointer-events-none"
    >
      {/* Backdrop */}
      {chatOpen && (
        <div
          role="presentation"
          className="pointer-events-auto widget-animate-fade-in fixed inset-0 bg-black/40"
          onClick={() => setChatOpen(false)}
        />
      )}

      {/* Chat panel — fullscreen on mobile, floating card on desktop */}
      {chatOpen && (
        <div className="swift-chat-panel pointer-events-auto widget-animate-slide-up fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-[110px] sm:right-5 sm:h-[500px] sm:max-h-[calc(100vh-140px)] sm:w-[380px] sm:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white pl-7 pr-4 py-3">
            <div className="flex items-center gap-3">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={displayName}
                  className="h-8.5 w-8.5 shrink-0 object-cover"
                />
              ) : (
                <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center bg-[#6433CC] text-sm font-bold text-white">
                  {initial}
                </div>
              )}
              <span className="font-mono truncate md:text-base text-sm font-normal tracking-wide text-gray-800 uppercase">
                {displayName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Nothing to reset until the visitor has actually said something. */}
              {chat.chatMessages.length > 1 && (
                <button
                  type="button"
                  onClick={chat.startNewConversation}
                  disabled={chat.isChatLoading}
                  aria-label="Start a new conversation"
                  title="Start a new conversation"
                  className="h-fit w-fit cursor-pointer text-[#1F1F1F] transition-opacity hover:opacity-60 disabled:cursor-default disabled:opacity-40"
                >
                  <SquarePen className="size-6 stroke-[1.5]" />
                </button>
              )}
              <button
                onClick={() => setChatOpen(false)}
                className="h-fit w-fit cursor-pointer text-[#1F1F1F]"
              >
                <ChevronDown className="size-8 stroke-[1.5]" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chat.chatScrollRef}
            className="swift-chat-messages scrollbar-none relative min-h-0 flex-1 overflow-y-auto px-7 py-4"
          >
            {companyLoading ? (
              <ChatSkeleton />
            ) : (
            <ChatMessageList
              messages={chat.chatMessages}
              chatEndRef={chat.chatEndRef}
              chatScrollRef={chat.chatScrollRef}
              stickToBottomRef={stickToBottomRef}
              hasRevealed={chat.hasRevealed}
              markRevealed={chat.markRevealed}
              companyName={companyName}
              companyLogoUrl={company?.logo_url}
            />
            )}
          </div>

          {/* FAQ quick questions — shown until the visitor sends a message */}
          {!companyLoading &&
            chat.chatMessages.length <= 1 &&
            bubbleQuestions.length > 0 && (
              <div className="flex shrink-0 flex-col gap-2 px-4 pb-2">
                {bubbleQuestions.slice(0, 3).map((question) => (
                  <button
                    key={question}
                    onClick={() => chat.sendMessage(question)}
                    disabled={chat.isChatLoading}
                    className="flex w-fit max-w-full cursor-pointer items-center gap-[9px] rounded-full p-1 text-left transition-colors hover:bg-gray-50 disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="font-sans flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F6F6F6] text-[12px] font-bold text-black">
                      ?
                    </span>
                    <span className="font-mono truncate text-[12px] tracking-[0.1em] text-black uppercase">
                      {question}
                    </span>
                  </button>
                ))}
              </div>
            )}

          {/* Input */}
          <div className="shrink-0 border border-[#D9D9D9] bg-white px-4 py-3 mx-3 mb-3 rounded-md">
            <ChatInput
              value={chat.chatInput}
              onChange={chat.setChatInput}
              onSend={chat.handleSendChat}
              selectedFiles={chat.selectedFiles}
              onFilesSelected={chat.addSelectedFiles}
              onRemoveSelectedFile={chat.removeSelectedFile}
              isLoading={chat.isChatLoading}
            />
          </div>

          {/* Footer */}
          <div className="shrink-0 pb-3 text-center font-mono text-[11px] uppercase leading-none text-black/40">
            POWERED BY{" "}
            <a
              target="_blank"
              rel="noreferrer noopener"
              href="https://swiftagents.org"
              className="hover:underline"
            >
              SWIFTAGENTS.ORG
            </a>
          </div>
        </div>
      )}

      {/* Bottom-right launcher — only rendered in widget mode.
          In button mode the host page provides its own trigger. */}
      {mode === "widget" && (
        <div
          className={cn(
            "pointer-events-auto fixed z-100 flex flex-col gap-3 select-none",
            launcherRest.side === "left" ? "items-start" : "items-end",
            chatOpen && "hidden sm:flex",
          )}
          style={launcherStyle}
        >
          {/* Assistance pill */}
          {!chatOpen && pillVisible && (
            <button
              onClick={handleLauncherClick}
              style={{ boxShadow: "0 5px 20px rgba(0,0,0,0.28)" }}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-full bg-white py-3.5 pr-6 pl-4 transition-shadow",
                pillLeaving ? "widget-bubble-exit" : "widget-animate-bubble",
              )}
            >
              <span className="font-mono flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-full bg-[#F6F6F6] text-lg font-medium text-black">
                ?
              </span>
              <span className="font-mono whitespace-nowrap text-sm tracking-[0.1em] text-black uppercase">
                Need assistance?
              </span>
            </button>
          )}

          <BriggsFace
            className={cn(
              "overflow-hidden rounded-full transition-transform hover:scale-105",
              launcherDrag ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{
              width: LAUNCHER_SIZE,
              height: LAUNCHER_SIZE,
              touchAction: "none",
            }}
            onClick={handleLauncherClick}
            onPointerDown={handleLauncherPointerDown}
            onPointerMove={handleLauncherPointerMove}
            onPointerUp={endLauncherDrag}
            onPointerCancel={handleLauncherPointerCancel}
          />
        </div>
      )}

      {viewedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewedImage.alt || "Image preview"}
          onClick={closeImage}
          className="pointer-events-auto fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={closeImage}
            aria-label="Close image preview"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative inline-block overflow-hidden rounded-lg"
          >
            <img
              src={viewedImage.src}
              alt={viewedImage.alt || ""}
              className="block max-h-[90vh] max-w-[90vw]"
            />
            {viewedImage.highlight && viewedImage.naturalDims ? (
              <HighlightOverlay
                highlight={viewedImage.highlight}
                imgW={viewedImage.naturalDims.w}
                imgH={viewedImage.naturalDims.h}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
    </ImageViewerContext.Provider>
  );
}

// --- App wrapper ---

function App({ companyId, mode }: { companyId: string; mode: WidgetMode }) {
  return <WidgetContent companyId={companyId} mode={mode} />;
}

const WIDGET_HOST_ID = "swift-agent-widget-root";
const WIDGET_FONT_STYLE_ID = "swift-agent-widget-fonts";
type WindowWithWidgetCss = Window & { __SWIFT_WIDGET_CSS__?: string };
type WindowWithWidget = Window & {
  SwiftAgentWidget?: {
    mount: typeof mountWidget;
    unmount: typeof unmountWidget;
    open: () => void;
    close: () => void;
    toggle: () => void;
    readonly isLoaded: boolean;
  };
};

interface MountOptions {
  baseUrl?: string;
  apiKey?: string;
  mode?: WidgetMode;
  trigger?: string;
}

let widgetRoot: Root | null = null;
let chatOpenSetterRef: Dispatch<SetStateAction<boolean>> | null = null;
let triggerCleanup: (() => void) | null = null;

function openChat() {
  chatOpenSetterRef?.(true);
}

function closeChat() {
  chatOpenSetterRef?.(false);
}

function toggleChat() {
  chatOpenSetterRef?.((current) => !current);
}

// Delegated click listener so triggers added later (SPA-rendered buttons)
// still work without re-binding.
function bindTrigger(selector: string) {
  const handler = (event: Event) => {
    const target = event.target as Element | null;
    if (target?.closest(selector)) {
      event.preventDefault();
      openChat();
    }
  };
  document.addEventListener("click", handler);
  triggerCleanup = () => document.removeEventListener("click", handler);
}

function registerWidgetFonts(css: string) {
  if (document.getElementById(WIDGET_FONT_STYLE_ID)) return;

  const fontFaceCss = css.match(/@font-face\s*{[^}]*}/g)?.join("\n");
  if (!fontFaceCss) return;

  const style = document.createElement("style");
  style.id = WIDGET_FONT_STYLE_ID;
  style.textContent = fontFaceCss;
  document.head.appendChild(style);
}

function resolveBaseUrl(script: HTMLScriptElement | null): string {
  const explicit = script?.getAttribute("data-base-url");
  if (explicit) return explicit.replace(/\/$/, "");

  const src = script?.getAttribute("src") ?? "";
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function mountWidget(companyId: string, options: MountOptions = {}) {
  if (document.getElementById(WIDGET_HOST_ID)) return;

  const { baseUrl, apiKey, mode = "widget", trigger } = options;

  const resolvedBase =
    baseUrl ??
    resolveBaseUrl(document.querySelector<HTMLScriptElement>(WIDGET_SCRIPT_SELECTOR));

  initApiClients(resolvedBase, apiKey);

  const host = document.createElement("div");
  host.id = WIDGET_HOST_ID;
  host.style.cssText =
    "position:fixed;top:0;left:0;width:100%;z-index:2147483647;pointer-events:none;";
  // Opt out of host-page smooth-scroll hijacking (e.g. Lenis), which otherwise
  // captures wheel events page-wide and starves the chat panel's own scroll.
  // Lenis walks the composed path, so this is honored through the shadow root.
  host.setAttribute("data-lenis-prevent", "");
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const css = (window as WindowWithWidgetCss).__SWIFT_WIDGET_CSS__;
  if (css) {
    registerWidgetFonts(css);

    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }

  const container = document.createElement("div");
  container.id = "swift-agent-widget-inner";
  shadow.appendChild(container);

  widgetRoot = createRoot(container);
  widgetRoot.render(<App companyId={companyId} mode={mode} />);

  if (trigger) bindTrigger(trigger);
}

function unmountWidget() {
  triggerCleanup?.();
  triggerCleanup = null;

  if (widgetRoot) {
    widgetRoot.unmount();
    widgetRoot = null;
  }
  document.getElementById(WIDGET_HOST_ID)?.remove();
  document.getElementById(WIDGET_FONT_STYLE_ID)?.remove();
}

(window as WindowWithWidget).SwiftAgentWidget = {
  mount: mountWidget,
  unmount: unmountWidget,
  open: openChat,
  close: closeChat,
  toggle: toggleChat,
  get isLoaded() {
    return !!document.getElementById(WIDGET_HOST_ID);
  },
};

function autoMount() {
  if (window !== window.top) return;

  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>(WIDGET_SCRIPT_SELECTOR);

  const companyId = script?.getAttribute("data-company-id") ?? "";
  if (!companyId) return;

  const baseUrl = resolveBaseUrl(script);
  const apiKey = script?.getAttribute("data-api-key") ?? undefined;
  const mode: WidgetMode =
    script?.getAttribute("data-mode") === "button" ? "button" : "widget";
  const trigger = script?.getAttribute("data-trigger") ?? undefined;

  mountWidget(companyId, { baseUrl, apiKey, mode, trigger });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoMount);
} else {
  autoMount();
}
