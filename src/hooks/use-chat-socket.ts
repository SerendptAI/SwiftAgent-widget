import { useEffect, useRef } from "react";

import { getBaseUrl } from "../lib/api-client";

/** A message as stored server-side, delivered over the chat WebSocket. */
export interface ServerChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  attachments?: unknown[];
  author_name?: string;
  avatar_url?: string;
}

export interface ServerChatSnapshot {
  resolved: boolean;
  ticketId?: string;
}

interface SocketPayload {
  type?: string;
  data?: {
    session_id?: string;
    ticket_id?: string;
    resolved?: boolean;
    messages?: unknown;
  };
}

const RECONNECT_MAX_MS = 15_000;

function toWsUrl(base: string, companyId: string, sessionId: string): string {
  const wsBase = base.replace(/^http/i, "ws");
  return `${wsBase}/api/v1/chat/${companyId}/chat/${sessionId}/ws`;
}

interface UseChatSocketOptions {
  companyId: string;
  sessionId: string;
  enabled: boolean;
  onSnapshot: (messages: ServerChatMessage[], meta: ServerChatSnapshot) => void;
}

/**
 * Maintains a chat WebSocket for the active session. The server pushes the full
 * message array on connect (`init`) and again whenever a new message lands
 * (`update`) — including human-agent replies on escalated tickets. The latest
 * array is handed to `onSnapshot`; reconciling it against local state lives in
 * the caller (use-widget-chat).
 */
export function useChatSocket({
  companyId,
  sessionId,
  enabled,
  onSnapshot,
}: UseChatSocketOptions): void {
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    if (!enabled || !companyId || !sessionId) return;
    const base = getBaseUrl();
    if (!base) return;

    let socket: WebSocket | null = null;
    let closedByUs = false;
    let reconnectTimer = 0;
    let attempts = 0;

    const scheduleReconnect = () => {
      if (closedByUs) return;
      attempts += 1;
      const delay = Math.min(1000 * 2 ** (attempts - 1), RECONNECT_MAX_MS);
      reconnectTimer = window.setTimeout(connect, delay);
    };

    function connect() {
      let openedAt = 0;
      try {
        socket = new WebSocket(toWsUrl(base, companyId, sessionId));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        openedAt = Date.now();
      };

      socket.onmessage = (event) => {
        let parsed: SocketPayload;
        try {
          parsed = JSON.parse(event.data as string) as SocketPayload;
        } catch {
          return;
        }
        if (parsed.type !== "init" && parsed.type !== "update") return;
        const data = parsed.data;
        if (!data || !Array.isArray(data.messages)) return;
        onSnapshotRef.current(data.messages as ServerChatMessage[], {
          resolved: !!data.resolved,
          ticketId:
            typeof data.ticket_id === "string" ? data.ticket_id : undefined,
        });
      };

      socket.onclose = () => {
        if (closedByUs) return;
        // Only treat a connection that stayed up as "healthy" enough to retry
        // fast; an immediate close (e.g. server rejects with 1011) backs off
        // instead of hammering the endpoint.
        if (openedAt && Date.now() - openedAt > 4000) attempts = 0;
        scheduleReconnect();
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {
          // Closing a socket that never opened can throw — ignore.
        }
      }
    };
  }, [companyId, sessionId, enabled]);
}
