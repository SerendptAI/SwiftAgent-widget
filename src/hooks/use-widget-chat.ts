import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type ChatAttachment, type ChatMsg } from "../components/types";
import { getBaseUrl } from "../lib/api-client";

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
  chatThinkingText: string | null;
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
      text: "Hey there! 👋 How can I help you?",
      sender: "agent",
      time: "",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<ChatAttachment[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatThinkingText, setChatThinkingText] = useState<string | null>(null);
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

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
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
        let agentText = "";
        let buffer = "";
        setChatMessages((prev) => [
          ...prev,
          { id: agentMsgId, text: "", sender: "agent", time: "" },
        ]);

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
                setChatThinkingText(message);
                scrollToBottom();
              } else if (stage === "tool") {
                const label = parsed?.data?.label;
                if (typeof label === "string") {
                  setChatThinkingText(label);
                  scrollToBottom();
                }
              } else if (stage === "stream" && typeof message === "string") {
                setChatThinkingText(null);
                agentText += message;
                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMsgId ? { ...m, text: agentText } : m,
                  ),
                );
                scrollToBottom();
              }
            } catch {
              // Skip malformed data
            }
          }
        }

        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? {
                  ...m,
                  text: agentText || "Sorry, I couldn't generate a response.",
                  time: new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : m,
          ),
        );
      } catch (err) {
        console.error("Chat error:", err);
        setChatMessages((prev) => [
          ...prev.filter((m) => m.id !== agentMsgId),
          {
            id: agentMsgId,
            text: "Sorry, something went wrong. Please try again.",
            sender: "agent" as const,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      } finally {
        setIsChatLoading(false);
        setChatThinkingText(null);
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
    chatThinkingText,
    chatEndRef,
    chatScrollRef,
    handleSendChat,
    sendMessage,
  };
}
