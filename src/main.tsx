import "./widget.css";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function WidgetContent({ companyId }: { companyId: string }) {
  const { data: company } = usePublicCompanyQuery(companyId);
  const companyName = company?.name;

  const chat = useWidgetChat({ companyId });

  useVisitorLog(companyId);

  const [chatOpen, setChatOpen] = useState(false);

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
          className="pointer-events-auto widget-animate-fade-in fixed inset-0 bg-black/40"
          onClick={() => setChatOpen(false)}
        />
      )}

      {/* Chat panel — fullscreen on mobile, floating card on desktop */}
      {chatOpen && (
        <div
          className="pointer-events-auto widget-animate-slide-up fixed inset-0 flex flex-col bg-white overflow-hidden sm:inset-auto sm:bottom-[110px] sm:right-5 sm:h-[500px] sm:max-h-[calc(100vh-140px)] sm:w-[380px] sm:rounded-2xl sm:shadow-[0_8px_40px_rgba(0,0,0,0.16)]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6433CC] text-sm font-bold text-white">
                {initial}
              </div>
              <span className="font-dm-mono truncate text-sm font-bold tracking-wide text-gray-800 uppercase">
                {displayName}
              </span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="scrollbar-none flex-1 space-y-4 overflow-y-auto px-4 py-5">
            <ChatMessageList
              messages={chat.chatMessages}
              thinkingText={chat.chatThinkingText}
              chatEndRef={chat.chatEndRef}
            />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <ChatInput
              value={chat.chatInput}
              onChange={chat.setChatInput}
              onSend={chat.handleSendChat}
              isLoading={chat.isChatLoading}
            />
          </div>
        </div>
      )}

      {/* Bottom-right launcher area — hidden on mobile when chat is open */}
      <div
        className={cn(
          "pointer-events-auto fixed z-[100] flex flex-col items-end gap-3",
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
            <span className="font-dm-mono whitespace-nowrap text-xs font-medium tracking-wide text-black uppercase sm:text-sm">
              {bubbleQuestions[bubbleIndex]}
            </span>
          </button>
        )}

        <BriggsFace
          className="cursor-pointer overflow-hidden rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-transform hover:scale-105"
          style={{ width: 72, height: 72 }}
          onClick={() => setChatOpen((o) => !o)}
        />
      </div>
    </div>
  );
}

// --- App wrapper ---

function App({ companyId }: { companyId: string }) {
  return <WidgetContent companyId={companyId} />;
}

const WIDGET_HOST_ID = "swift-agent-widget-root";
const SCRIPT_SELECTOR = "script[data-company-id]";
type WindowWithWidgetCss = Window & { __SWIFT_WIDGET_CSS__?: string };
type WindowWithWidget = Window & {
  SwiftAgentWidget?: {
    mount: typeof mountWidget;
    unmount: typeof unmountWidget;
    readonly isLoaded: boolean;
  };
};

let widgetRoot: Root | null = null;

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

function mountWidget(companyId: string, baseUrl?: string) {
  if (document.getElementById(WIDGET_HOST_ID)) return;

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
    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }

  const container = document.createElement("div");
  container.id = "swift-agent-widget-inner";
  shadow.appendChild(container);

  widgetRoot = createRoot(container);
  widgetRoot.render(<App companyId={companyId} />);
}

function unmountWidget() {
  if (widgetRoot) {
    widgetRoot.unmount();
    widgetRoot = null;
  }
  document.getElementById(WIDGET_HOST_ID)?.remove();
}

(window as WindowWithWidget).SwiftAgentWidget = {
  mount: mountWidget,
  unmount: unmountWidget,
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

  mountWidget(companyId, baseUrl);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoMount);
} else {
  autoMount();
}
