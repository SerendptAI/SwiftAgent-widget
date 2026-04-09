import { useCallback, useEffect, useRef, useState } from "react";

import { localApiClient } from "../lib/api-client";
import { useSTT } from "./use-stt";

export interface VoiceChatOptions {
  companyId: string;
  onStatusChange?: (status: string) => void;
  onTranscript?: (text: string) => void;
  onSpeechStart?: () => void;
  onReply?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useVoiceChat({
  companyId,
  onStatusChange,
  onTranscript,
  onSpeechStart,
  onReply,
  onError,
}: VoiceChatOptions) {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isPausedRef = useRef(false);

  const socketRef = useRef<WebSocket | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const statusRef = useRef<string>("Idle");
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  // Stable refs for callbacks
  const onStatusChangeRef = useRef(onStatusChange);
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onReplyRef = useRef(onReply);
  const onErrorRef = useRef(onError);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onTranscriptRef.current = onTranscript;
    onSpeechStartRef.current = onSpeechStart;
    onReplyRef.current = onReply;
    onErrorRef.current = onError;
    isMutedRef.current = isMuted;
  }, [onStatusChange, onTranscript, onSpeechStart, onReply, onError, isMuted]);

  const THINKING_TIMEOUT_MS = 30_000;

  // --- STT (ElevenLabs via use-stt hook) ---

  const sendMessageRef = useRef<(data: Record<string, unknown>) => void>(
    () => {},
  );

  const {
    start: sttStart,
    stop: sttStop,
    abort: sttAbort,
  } = useSTT({
    onTranscript: (text) => {
      if (isMutedRef.current) return;
      if (statusRef.current.toLowerCase() !== "ready") return;

      onTranscriptRef.current?.(text);
      sendMessageRef.current({ type: "user_text", text });
      handleStatusChange("Thinking");
    },
    onSpeechStart: () => onSpeechStartRef.current?.(),
    onError: (msg) => onErrorRef.current?.(msg),
  });

  const sttStartRef = useRef(sttStart);
  const sttAbortRef = useRef(sttAbort);
  const sttStopRef = useRef(sttStop);
  useEffect(() => {
    sttStartRef.current = sttStart;
    sttAbortRef.current = sttAbort;
    sttStopRef.current = sttStop;
  }, [sttStart, sttAbort, sttStop]);

  // --- Status management ---

  const startListening = useCallback(() => {
    if (isPausedRef.current) return;
    sttStartRef.current();
  }, []);

  const handleStatusChange = useCallback(
    (status: string) => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      statusRef.current = status;
      onStatusChangeRef.current?.(status);

      if (status.toLowerCase() === "thinking") {
        thinkingTimeoutRef.current = setTimeout(() => {
          if (statusRef.current.toLowerCase() === "thinking") {
            statusRef.current = "Ready";
            onStatusChangeRef.current?.("Ready");
            startListening();
          }
        }, THINKING_TIMEOUT_MS);
      }
    },
    [startListening],
  );

  // --- WebSocket messaging ---

  const sendMessage = useCallback((data: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }, []);

  // Keep ref in sync so STT callback can use it
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // --- Cleanup ---

  const cleanup = useCallback(() => {
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      if (audioElementRef.current.src) {
        URL.revokeObjectURL(audioElementRef.current.src);
      }
      audioElementRef.current = null;
    }
    sttAbortRef.current();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsActive(false);
  }, []);

  // --- TTS (ElevenLabs) ---

  const speakText = useCallback(
    async (text: string) => {
      if (isPausedRef.current) return;

      ttsAbortRef.current?.abort();
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        if (audioElementRef.current.src) {
          URL.revokeObjectURL(audioElementRef.current.src);
        }
      }

      const controller = new AbortController();
      ttsAbortRef.current = controller;

      try {
        handleStatusChange("Speaking");
        sttAbortRef.current(); // Stop listening while speaking

        const { data: blob } = await localApiClient.post(
          "/api/v1/tts",
          { text },
          { signal: controller.signal, responseType: "blob" },
        );
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElementRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (statusRef.current.toLowerCase() === "speaking") {
            handleStatusChange("Ready");
            startListening();
          }
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          onErrorRef.current?.("Failed to play agent response");
          handleStatusChange("Ready");
          startListening();
        };

        await audio.play();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        onErrorRef.current?.("Failed to play agent response");
        handleStatusChange("Ready");
        startListening();
      }
    },
    [handleStatusChange, startListening],
  );

  // --- Start / Stop ---

  const start = useCallback(() => {
    handleStatusChange("Connecting");
    setIsActive(true);
  }, [handleStatusChange]);

  const stop = useCallback(() => {
    sendMessage({ type: "end" });
    cleanup();
    handleStatusChange("Idle");
  }, [cleanup, handleStatusChange, sendMessage]);

  // --- Main effect: WebSocket connection + STT when active ---

  useEffect(() => {
    if (!isActive) return;

    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
    const wsBase = baseUrl.replace(/^http/, "ws");
    const wssUrl = `${wsBase}/api/v1/voice/${companyId}/call`;
    const socket = new WebSocket(wssUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      handleStatusChange("Ready");

      socket.send(
        JSON.stringify({
          type: "start",
          session_id: crypto.randomUUID(),
        }),
      );

      // Start listening for speech
      sttStartRef.current();
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case "status": {
          const newStatus = message.status as string;
          if (statusRef.current.toLowerCase() === "speaking") break;
          handleStatusChange(newStatus);
          if (newStatus.toLowerCase() === "ready") {
            startListening();
          }
          break;
        }
        case "reply_text":
          onReplyRef.current?.(message.text);
          speakText(message.text);
          break;
        case "error": {
          const parts = [
            message.message,
            message.detail,
            message.reason,
            message.code != null ? `code: ${message.code}` : "",
          ].filter(Boolean);
          const fullMessage =
            parts.length > 0 ? parts.join(" — ") : JSON.stringify(message);
          onErrorRef.current?.(fullMessage);
          break;
        }
      }
    };

    socket.onerror = () => {
      onErrorRef.current?.("Connection failed");
    };

    socket.onclose = () => {
      setIsActive(false);
      cleanup();
    };

    return () => {
      socket.close();
    };
  }, [
    isActive,
    companyId,
    handleStatusChange,
    cleanup,
    startListening,
    speakText,
  ]);

  // --- Pause / Resume (for tab switching) ---

  const pause = useCallback(() => {
    isPausedRef.current = true;
    sttAbortRef.current();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    if (
      isActive &&
      statusRef.current.toLowerCase() === "ready" &&
      !isMutedRef.current
    ) {
      sttStartRef.current();
    }
  }, [isActive]);

  // --- Mute toggle ---

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      if (newMuted) {
        sttAbortRef.current();
      } else if (statusRef.current.toLowerCase() === "ready") {
        sttStartRef.current();
      }
      return newMuted;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    isActive,
    isMuted,
    start,
    stop,
    toggleMute,
    speakText,
    pause,
    resume,
  };
}
