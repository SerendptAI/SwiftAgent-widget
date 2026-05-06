import "./widget.css";

import { ChevronDown } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { BriggsFace } from "./components/BriggsFace";
import { ChatInput } from "./components/ChatInput";
import { ChatMessageList } from "./components/ChatMessageList";

import { usePublicCompanyQuery } from "./hooks/use-public-company";
import { useVisitorLog } from "./hooks/use-visitor-log";
import { useWidgetChat } from "./hooks/use-widget-chat";
import { initApiClients } from "./lib/api-client";
import { cn } from "./lib/cn";

// --- Main Widget Component ---

export type WidgetMode = "widget" | "button";

function WidgetContent({
  companyId,
  mode,
}: {
  companyId: string;
  mode: WidgetMode;
}) {
  const { data: company } = usePublicCompanyQuery(companyId);
  const companyName = company?.name;

  const chat = useWidgetChat({ companyId });

  useVisitorLog(companyId);

  const [chatOpen, setChatOpen] = useState(false);

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

  // Rotating prompt bubble — starts hidden, shows questions in bursts with pauses
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleAnimating, setBubbleAnimating] = useState(false);
  const bubbleQuestions = useMemo(
    () => [
      `What is ${companyName || "this company"} about`,
      "Whats the pricing like?",
      "Are you looking for support?",
    ],
    [companyName],
  );

  // Rotate prompt bubble: hidden initially, then show/hide in cycles with pauses
  useEffect(() => {
    if (chatOpen) {
      setBubbleVisible(false);
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
        setBubbleAnimating(false);
        setBubbleVisible(true);
        await wait(4000);

        setBubbleAnimating(true);
        await wait(300);
        setBubbleVisible(false);
        setBubbleAnimating(false);

        await wait(2500);

        if (!cancelled) {
          setBubbleIndex((i) => (i + 1) % bubbleQuestions.length);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [chatOpen, bubbleQuestions.length]);

  const handleBubbleClick = useCallback(
    (question: string) => {
      setChatOpen(true);
      setBubbleVisible(false);
      // Small delay so the chat panel opens first
      setTimeout(() => {
        chat.sendMessage(question);
      }, 100);
    },
    [chat],
  );

  const initial = companyName ? companyName.charAt(0).toUpperCase() : "";
  const displayName = companyName || "";

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-end font-sans pointer-events-none">
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
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
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
            <button
              onClick={() => setChatOpen(false)}
              className="h-fit w-fit cursor-pointer text-[#1F1F1F]"
            >
              <ChevronDown className="size-8 stroke-[1.5]" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chat.chatScrollRef}
            className="swift-chat-messages scrollbar-none relative min-h-0 flex-1 overflow-y-auto px-4 py-5"
          >
            <ChatMessageList
              messages={chat.chatMessages}
              thinkingText={chat.chatThinkingText}
              chatEndRef={chat.chatEndRef}
              footer={
                <div className="px-4 pb-[18px] pt-8 text-center font-mono text-[11px] uppercase leading-none text-black/40">
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
              }
            />
          </div>

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
        </div>
      )}

      {/* Bottom-right launcher — only rendered in widget mode.
          In button mode the host page provides its own trigger. */}
      {mode === "widget" && (
        <div
          className={cn(
            "pointer-events-auto fixed z-100 flex flex-col items-end gap-3",
            chatOpen && "hidden sm:flex",
          )}
          style={{ bottom: 30, right: 30 }}
        >
          {/* Rotating prompt bubble */}
          {!chatOpen && bubbleVisible && (
            <button
              onClick={() => handleBubbleClick(bubbleQuestions[bubbleIndex])}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-full bg-white px-5 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_4px_24px_rgba(0,0,0,0.18)]",
                bubbleAnimating
                  ? "widget-bubble-exit"
                  : "widget-animate-bubble",
              )}
              key={bubbleIndex}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
                ?
              </span>
              <span className="font-mono whitespace-nowrap text-xs font-medium tracking-wide text-black uppercase sm:text-sm">
                {bubbleQuestions[bubbleIndex]}
              </span>
            </button>
          )}

          <BriggsFace
            className="cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-105"
            style={{ width: 72, height: 72 }}
            onClick={() => setChatOpen((o) => !o)}
          />
        </div>
      )}
    </div>
  );
}

// --- App wrapper ---

function App({ companyId, mode }: { companyId: string; mode: WidgetMode }) {
  return <WidgetContent companyId={companyId} mode={mode} />;
}

const WIDGET_HOST_ID = "swift-agent-widget-root";
const WIDGET_FONT_STYLE_ID = "swift-agent-widget-fonts";
const SCRIPT_SELECTOR = "script[data-company-id]";
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

  const { baseUrl, mode = "widget", trigger } = options;

  const resolvedBase =
    baseUrl ??
    resolveBaseUrl(document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR));

  initApiClients(resolvedBase);

  const host = document.createElement("div");
  host.id = WIDGET_HOST_ID;
  host.style.cssText =
    "position:fixed;top:0;left:0;width:100%;z-index:2147483647;pointer-events:none;";
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
    document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);

  const companyId = script?.getAttribute("data-company-id") ?? "";
  if (!companyId) return;

  const baseUrl = resolveBaseUrl(script);
  const mode: WidgetMode =
    script?.getAttribute("data-mode") === "button" ? "button" : "widget";
  const trigger = script?.getAttribute("data-trigger") ?? undefined;

  mountWidget(companyId, { baseUrl, mode, trigger });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoMount);
} else {
  autoMount();
}
