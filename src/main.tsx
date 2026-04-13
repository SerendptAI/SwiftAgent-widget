import "./widget.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BriggsFace } from "./components/BriggsFace";
import { WidgetTab } from "./components/types";

import { WidgetCallTab } from "./components/WidgetCallTab";
import { WidgetChatTab } from "./components/WidgetChatTab";
import { WidgetHeader } from "./components/WidgetHeader";
import { WidgetMinimizedChat } from "./components/WidgetMinimizedChat";
import { WidgetMinimizedControls } from "./components/WidgetMinimizedControls";

import { usePublicCompanyQuery } from "./hooks/use-public-company";
import { useVisitorLog } from "./hooks/use-visitor-log";
import { useVoiceChat } from "./hooks/use-voice-chat";
import { useWidgetAudio } from "./hooks/use-widget-audio";
import { useWidgetChat } from "./hooks/use-widget-chat";
import { initApiClients } from "./lib/api-client";
import { cn } from "./lib/cn";

// --- Main Widget Component ---

function WidgetContent({ companyId }: { companyId: string }) {
  const { data: company } = usePublicCompanyQuery(companyId);
  const companyName = company?.name;

  const { dialingAudioRef, pickupAudioRef, playTouchSound, stopDialingAudio } =
    useWidgetAudio();

  const chat = useWidgetChat({ companyId });

  useVisitorLog(companyId);

  const [isMinimized, setIsMinimized] = useState(false);
  const [statusText, setStatusText] = useState("Idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeWidgetTab, setActiveWidgetTab] = useState<WidgetTab>("call");

  const hasPlayedPickupRef = useRef(false);
  const dialingStartTimeRef = useRef(0);
  const isDialingPhaseRef = useRef(false);

  const handleStatusChange = useCallback(
    (s: string) => {
      if (s.toLowerCase() === "ready" && !hasPlayedPickupRef.current) {
        hasPlayedPickupRef.current = true;
        isDialingPhaseRef.current = true;
        setStatusText("Calling");
        const elapsed = Date.now() - dialingStartTimeRef.current;
        const remaining = Math.max(0, 4000 - elapsed);
        setTimeout(() => {
          isDialingPhaseRef.current = false;
          stopDialingAudio();
          const pickupAudio = pickupAudioRef.current;
          if (pickupAudio) {
            pickupAudio.onended = () => {
              speakText("Hello, how can I help you?");
            };
            pickupAudio.play().catch(() => {});
          } else {
            speakText("Hello, how can I help you?");
          }
          setStatusText("Ready");
        }, remaining);
      } else if (isDialingPhaseRef.current) {
        return;
      } else {
        setStatusText(s);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopDialingAudio, pickupAudioRef],
  );

  const handleSpeechStart = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const handleError = useCallback(
    (err: Error | string) => {
      const msg = typeof err === "string" ? err : (err?.message ?? String(err));
      console.error("Voice Chat Error:", msg);
      setErrorMessage(msg);
      stopDialingAudio();
    },
    [stopDialingAudio],
  );

  const {
    isActive,
    isMuted,
    start,
    stop,
    toggleMute,
    speakText,
    pause,
    resume,
  } = useVoiceChat({
    companyId,
    onStatusChange: handleStatusChange,
    onTranscript: useCallback(() => {}, []),
    onSpeechStart: handleSpeechStart,
    onReply: useCallback(() => {}, []),
    onError: handleError,
  });

  const callStatus = isActive ? "ongoing" : "idle";

  useEffect(() => {
    if (!isActive) {
      setErrorMessage(null);
      setIsMinimized(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    if (activeWidgetTab === "chat") {
      pause();
    } else {
      resume();
    }
  }, [activeWidgetTab, isActive, pause, resume]);

  const handleStartCall = useCallback(() => {
    setErrorMessage(null);
    hasPlayedPickupRef.current = false;
    isDialingPhaseRef.current = false;
    dialingStartTimeRef.current = Date.now();
    dialingAudioRef.current?.play().catch(() => {});
    start();
  }, [start, dialingAudioRef]);

  const handleEndCall = useCallback(() => {
    playTouchSound();
    stopDialingAudio();
    stop();
  }, [playTouchSound, stopDialingAudio, stop]);

  const handleRequestCallClick = useCallback(() => {
    if (callStatus === "idle") {
      handleStartCall();
    }
  }, [callStatus, handleStartCall]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 flex flex-col items-center justify-start font-sans",
        isActive ? "pointer-events-none inset-0" : "pointer-events-auto",
      )}
    >
      <div className="pointer-events-auto z-[100] w-full">
        {callStatus === "ongoing" && (
          <div
            className={cn(
              "pointer-events-auto fixed inset-0 z-50 flex items-start justify-center",
              !isMinimized
                ? "widget-animate-fade-in backdrop-blur-sm"
                : "pointer-events-none",
            )}
          >
            <div
              className={cn(
                "widget-container relative h-full max-h-screen w-full overflow-visible rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100vh-24px)] sm:w-[95%] sm:max-w-[1200px] sm:rounded-4xl",
                isMinimized ? "widget-minimized" : "widget-animate-slide-up",
              )}
            >
              <BriggsFace
                className="widget-animate-float-in absolute right-4 bottom-24 z-50 cursor-pointer overflow-hidden rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition hover:scale-105 sm:top-auto sm:-right-4 sm:-bottom-20"
                style={{ width: 72, height: 72 }}
                onClick={() => setIsMinimized(true)}
              />

              {activeWidgetTab === "call" ? (
                <>
                  <WidgetHeader
                    activeWidgetTab={activeWidgetTab}
                    setActiveWidgetTab={setActiveWidgetTab}
                  />
                  <WidgetCallTab
                    companyName={companyName}
                    isMuted={isMuted}
                    statusText={statusText}
                    errorMessage={errorMessage}
                    showHashInput={chat.showHashInput}
                    setShowHashInput={chat.setShowHashInput}
                    hashValue={chat.hashValue}
                    setHashValue={chat.setHashValue}
                    handleHashSubmit={() => {
                      chat.handleHashSubmit();
                      setActiveWidgetTab("chat");
                    }}
                    playTouchSound={playTouchSound}
                    toggleMute={toggleMute}
                    handleEndCall={handleEndCall}
                  />
                </>
              ) : (
                <WidgetChatTab
                  companyName={companyName}
                  chatMessages={chat.chatMessages}
                  chatInput={chat.chatInput}
                  setChatInput={chat.setChatInput}
                  handleSendChat={chat.handleSendChat}
                  isChatLoading={chat.isChatLoading}
                  chatThinkingText={chat.chatThinkingText}
                  chatEndRef={chat.chatEndRef}
                  setActiveWidgetTab={setActiveWidgetTab}
                  setIsMinimized={setIsMinimized}
                />
              )}
            </div>
          </div>
        )}

        {callStatus === "ongoing" &&
          isMinimized &&
          activeWidgetTab === "call" && (
            <WidgetMinimizedControls
              isMuted={isMuted}
              handleEndCall={handleEndCall}
              playTouchSound={playTouchSound}
              toggleMute={toggleMute}
              setIsMinimized={setIsMinimized}
            />
          )}

        {callStatus === "ongoing" &&
          isMinimized &&
          activeWidgetTab === "chat" && (
            <WidgetMinimizedChat
              companyName={companyName}
              chatMessages={chat.chatMessages}
              chatInput={chat.chatInput}
              setChatInput={chat.setChatInput}
              handleSendChat={chat.handleSendChat}
              isChatLoading={chat.isChatLoading}
              chatThinkingText={chat.chatThinkingText}
              chatEndRef={chat.chatEndRef}
              setIsMinimized={setIsMinimized}
            />
          )}
      </div>

      {/* Main Briggs face launcher - always visible in bottom right when idle or minimized */}
      {(callStatus === "idle" || isMinimized) && (
        <BriggsFace
          className="pointer-events-auto fixed z-[100] cursor-pointer overflow-hidden rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-transform hover:scale-105"
          style={{ bottom: 30, right: 30, width: 72, height: 72 }}
          onClick={() => {
            if (callStatus === "idle") {
              handleRequestCallClick();
            } else {
              setIsMinimized(false);
            }
          }}
        />
      )}
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
  // z-index 2147483647 is the 32-bit signed int max — ensures the widget
  // sits above any page content including sticky nav bars.
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

// window.SwiftAgentWidget.mount("company-id", "https://api.example.com")
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
