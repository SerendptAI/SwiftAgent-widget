import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  TICKET_CREATED_RE,
  TICKET_STAGE_RE,
} from "../components/ChatMessageList";
import {
  type ChatAttachment,
  type ChatMsg,
  type NavigationGuide,
  type NavigationStep,
} from "../components/types";
import { getBaseUrl } from "../lib/api-client";

const DEFAULT_CHAT_ERROR_TEXT =
  "Sorry, something went wrong. Please try again.";

// Backends may serialize the highlight rect as {x,y,w,h}, {x,y,width,height},
// {left,top,width,height}, or bbox:[x,y,w,h]. Normalize to {x,y,w,h}.
function normalizeHighlight(raw: unknown): NavigationStep["highlight"] {
  if (!raw) return undefined;
  if (Array.isArray(raw) && raw.length === 4 && raw.every((n) => typeof n === "number")) {
    return { x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
  }
  if (typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const x = typeof r.x === "number" ? r.x : typeof r.left === "number" ? r.left : undefined;
  const y = typeof r.y === "number" ? r.y : typeof r.top === "number" ? r.top : undefined;
  const w = typeof r.w === "number" ? r.w : typeof r.width === "number" ? r.width : undefined;
  const h = typeof r.h === "number" ? r.h : typeof r.height === "number" ? r.height : undefined;
  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return undefined;
  }
  return { x, y, w, h };
}

interface UseWidgetChatOptions {
  companyId: string;
}

interface UseWidgetChatReturn {
  chatMessages: ChatMsg[];
  chatInput: string;
  setChatInput: (val: string) => void;
  selectedFiles: ChatAttachment[];
  addSelectedFiles: (files: FileList | File[]) => void;
  removeSelectedFile: (id: string) => void;
  isChatLoading: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  chatScrollRef: RefObject<HTMLDivElement | null>;
  handleSendChat: () => void;
  sendMessage: (text: string) => void;
}

export function useWidgetChat({
  companyId,
}: UseWidgetChatOptions): UseWidgetChatReturn {
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      id: 1,
      text: "",
      sender: "agent",
      time: "",
      blocks: [
        { kind: "text", content: "Hey there! 👋 How can I help you?" },
      ],
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<ChatAttachment[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatSessionId = useMemo(() => crypto.randomUUID(), []);

  const chatInputRef = useRef(chatInput);
  chatInputRef.current = chatInput;
  const selectedFilesRef = useRef(selectedFiles);
  selectedFilesRef.current = selectedFiles;
  const attachmentUrlsRef = useRef(new Set<string>());
  const isChatLoadingRef = useRef(isChatLoading);
  isChatLoadingRef.current = isChatLoading;

  useEffect(() => {
    return () => {
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentUrlsRef.current.clear();
    };
  }, []);

  const pendingScrollRef = useRef(false);
  const scrollToBottom = useCallback(() => {
    if (pendingScrollRef.current) return;
    pendingScrollRef.current = true;
    requestAnimationFrame(() => {
      pendingScrollRef.current = false;
      const scrollContainer = chatScrollRef.current;

      if (scrollContainer) {
        try {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: "smooth",
          });
        } catch {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }

        return;
      }

      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  const addSelectedFiles = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files)
      .filter((file) => {
        const name = file.name.toLowerCase();
        const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
        const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
        const isImage = file.type.startsWith("image/") && !isSvg;

        return isPdf || isImage;
      })
      .map((file) => {
        const url = URL.createObjectURL(file);
        attachmentUrlsRef.current.add(url);

        return {
          id: `${Date.now()}-${crypto.randomUUID()}`,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          url,
          kind:
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
              ? "pdf"
              : "image",
        } satisfies ChatAttachment;
      });

    if (nextFiles.length) {
      setSelectedFiles((current) => [...current, ...nextFiles]);
    }
  }, []);

  const removeSelectedFile = useCallback((id: string) => {
    setSelectedFiles((current) => {
      const fileToRemove = current.find((file) => file.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.url);
        attachmentUrlsRef.current.delete(fileToRemove.url);
      }

      return current.filter((file) => file.id !== id);
    });
  }, []);

  const sendMessageInternal = useCallback(
    async (userText: string, attachments: ChatAttachment[] = []) => {
      if (
        (!userText.trim() && attachments.length === 0) ||
        isChatLoadingRef.current
      ) {
        return;
      }

      const text = userText.trim();
      const backendText =
        text ||
        `Uploaded ${attachments.length} file${attachments.length === 1 ? "" : "s"}.`;
      const userMsg: ChatMsg = {
        id: Date.now(),
        text,
        sender: "user",
        attachments,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setChatInput("");
      setSelectedFiles([]);
      setIsChatLoading(true);
      setTimeout(scrollToBottom, 50);

      const agentMsgId = Date.now() + 1;
      // Create the agent placeholder up front so stage labels can attach to it
      // before any stream chunk arrives.
      setChatMessages((prev) => [
        ...prev,
        {
          id: agentMsgId,
          text: "",
          sender: "agent",
          time: "",
          blocks: [],
          pending: true,
        },
      ]);

      // Updater that returns `null` to signal "no change" — when nothing
      // changed we hand the same array back to React so memo'd children
      // (AgentMessage) skip re-rendering.
      const updateAgent = (updater: (msg: ChatMsg) => ChatMsg | null) => {
        setChatMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (m.id !== agentMsgId) return m;
            const updated = updater(m);
            if (updated === null) return m;
            changed = true;
            return updated;
          });
          return changed ? next : prev;
        });
      };

      const appendStage = (label: string) => {
        const trimmed = label.trim();
        if (!trimmed) return;

        // Ticket-lifecycle events (creating / created / success) collapse
        // into a single ticket block that updates in place — so the pill
        // transitions from "Creating ticket..." to "Ticket created"
        // without leaving stale duplicate rows behind.
        if (TICKET_STAGE_RE.test(trimmed)) {
          updateAgent((m) => {
            const blocks = m.blocks ?? [];
            const ticketIdx = blocks.findIndex(
              (b) => b.kind === "stage" && TICKET_STAGE_RE.test(b.content),
            );
            if (ticketIdx >= 0) {
              const existing = blocks[ticketIdx];
              if (existing.kind === "stage" && existing.content === trimmed) {
                return null;
              }
              // Lifecycle is monotonic: once a "created/success" event has
              // landed, later "creating" events are stale and must not
              // demote the pill back to the spinner state.
              if (
                existing.kind === "stage" &&
                TICKET_CREATED_RE.test(existing.content) &&
                !TICKET_CREATED_RE.test(trimmed)
              ) {
                return null;
              }
              const next = [...blocks];
              next[ticketIdx] = { kind: "stage", content: trimmed };
              return { ...m, blocks: next };
            }
            return {
              ...m,
              blocks: [...blocks, { kind: "stage", content: trimmed }],
            };
          });
          return;
        }

        updateAgent((m) => {
          const blocks = m.blocks ?? [];
          // Non-ticket stages collapse into a single in-place block whose
          // content swaps as new labels arrive — so the UI reads as one
          // status word replacing another, not a growing log of rows.
          let stageIdx = -1;
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.kind === "stage" && !TICKET_STAGE_RE.test(b.content)) {
              stageIdx = i;
              break;
            }
          }
          if (stageIdx >= 0) {
            const existing = blocks[stageIdx];
            if (existing.kind === "stage" && existing.content === trimmed) {
              return null;
            }
            const next = [...blocks];
            next[stageIdx] = { kind: "stage", content: trimmed };
            return { ...m, blocks: next };
          }
          return {
            ...m,
            blocks: [...blocks, { kind: "stage", content: trimmed }],
          };
        });
      };

      // Pace stage reveals so a burst of "thinking" events doesn't dump
      // every row at once. Min 400ms between appends; remaining queue
      // flushes immediately when text/navigation arrives so ordering
      // matches the stream.
      const STAGE_MIN_INTERVAL_MS = 400;
      const stageQueue: string[] = [];
      let stageTimer: number | null = null;
      let lastStageAt = 0;

      const drainStageQueue = () => {
        stageTimer = null;
        if (stageQueue.length === 0) return;
        const elapsed = Date.now() - lastStageAt;
        if (elapsed < STAGE_MIN_INTERVAL_MS) {
          stageTimer = window.setTimeout(
            drainStageQueue,
            STAGE_MIN_INTERVAL_MS - elapsed,
          );
          return;
        }
        const next = stageQueue.shift()!;
        appendStage(next);
        lastStageAt = Date.now();
        scrollToBottom();
        if (stageQueue.length > 0) {
          stageTimer = window.setTimeout(
            drainStageQueue,
            STAGE_MIN_INTERVAL_MS,
          );
        }
      };

      const enqueueStage = (label: string) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        const lastQueued = stageQueue[stageQueue.length - 1];
        if (lastQueued === trimmed) return;
        stageQueue.push(trimmed);
        if (stageTimer === null) drainStageQueue();
      };

      const flushPendingStages = () => {
        if (stageTimer !== null) {
          window.clearTimeout(stageTimer);
          stageTimer = null;
        }
        while (stageQueue.length > 0) {
          appendStage(stageQueue.shift()!);
        }
        lastStageAt = Date.now();
      };

      const appendNavigation = (guide: NavigationGuide) => {
        if (!guide.steps?.length) return;
        updateAgent((m) => {
          const blocks = m.blocks ?? [];
          return {
            ...m,
            blocks: [...blocks, { kind: "navigation", guide }],
          };
        });
      };

      const appendText = (chunk: string) => {
        if (!chunk) return;
        updateAgent((m) => {
          const blocks = m.blocks ?? [];
          const last = blocks[blocks.length - 1];
          if (last?.kind === "text") {
            const merged = blocks.slice(0, -1);
            merged.push({ kind: "text", content: last.content + chunk });
            return { ...m, blocks: merged };
          }
          return {
            ...m,
            blocks: [...blocks, { kind: "text", content: chunk }],
          };
        });
      };

      const replaceWithError = (errorText: string) => {
        updateAgent((m) => ({
          ...m,
          blocks: [{ kind: "text", content: errorText }],
          pending: false,
        }));
      };

      try {
        const res = await fetch(`${getBaseUrl()}/api/v1/chat/${companyId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: chatSessionId,
            message: backendText,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;

            try {
              const parsed = JSON.parse(dataLine.slice(6));
              const stage = parsed?.data?.stage;
              const message = parsed?.data?.message;

              if (stage === "thinking" && typeof message === "string") {
                enqueueStage(message);
              } else if (stage === "tool") {
                const label = parsed?.data?.label;
                if (typeof label === "string") {
                  enqueueStage(label);
                }
              } else if (stage === "stream" && typeof message === "string") {
                flushPendingStages();
                appendText(message);
                scrollToBottom();
              } else if (stage === "navigation_guide") {
                const rawSteps = parsed?.data?.steps;
                if (Array.isArray(rawSteps) && rawSteps.length > 0) {
                  const steps: NavigationStep[] = rawSteps
                    .filter(
                      (s: unknown): s is Record<string, unknown> =>
                        !!s && typeof s === "object",
                    )
                    .map((s) => ({
                      step: typeof s.step === "number" ? s.step : 0,
                      page_title:
                        typeof s.page_title === "string"
                          ? s.page_title
                          : undefined,
                      instruction:
                        typeof s.instruction === "string" ? s.instruction : "",
                      screenshot_url:
                        typeof s.screenshot_url === "string"
                          ? s.screenshot_url
                          : undefined,
                      highlight:
                        normalizeHighlight(s.highlight) ??
                        normalizeHighlight(s.bbox) ??
                        normalizeHighlight(s.target) ??
                        normalizeHighlight(s.box),
                    }))
                    .filter((s) => s.instruction);
                  const pathSummary = Array.isArray(parsed?.data?.path_summary)
                    ? (parsed.data.path_summary as unknown[]).filter(
                        (p): p is string => typeof p === "string",
                      )
                    : undefined;
                  flushPendingStages();
                  appendNavigation({ steps, path_summary: pathSummary });
                  scrollToBottom();
                }
              } else if (stage === "error") {
                const errorText =
                  typeof message === "string" && message.trim()
                    ? message
                    : DEFAULT_CHAT_ERROR_TEXT;
                flushPendingStages();
                replaceWithError(errorText);
                scrollToBottom();
              }
            } catch {
              continue;
            }
          }
        }

        const now = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const fallback = "Sorry, I couldn't generate a response.";
        updateAgent((m) => {
          const blocks = m.blocks ?? [];
          const hasContent = blocks.some(
            (b) => b.kind === "text" || b.kind === "navigation",
          );
          return {
            ...m,
            blocks: hasContent
              ? blocks
              : [...blocks, { kind: "text", content: fallback }],
            pending: false,
            time: now,
          };
        });
      } catch (err) {
        console.error("Chat error:", err);
        const now = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        updateAgent((m) => ({
          ...m,
          blocks: [{ kind: "text", content: DEFAULT_CHAT_ERROR_TEXT }],
          pending: false,
          time: now,
        }));
      } finally {
        flushPendingStages();
        setIsChatLoading(false);
      }
    },
    [companyId, chatSessionId, scrollToBottom],
  );

  const handleSendChat = useCallback(() => {
    sendMessageInternal(chatInputRef.current, selectedFilesRef.current);
  }, [sendMessageInternal]);

  const sendMessage = useCallback(
    (text: string) => {
      sendMessageInternal(text);
    },
    [sendMessageInternal],
  );

  return {
    chatMessages,
    chatInput,
    setChatInput,
    selectedFiles,
    addSelectedFiles,
    removeSelectedFile,
    isChatLoading,
    chatEndRef,
    chatScrollRef,
    handleSendChat,
    sendMessage,
  };
}
