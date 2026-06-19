import { type ChatAttachment, type ChatMsg } from "../components/types";

/**
 * Persists chat history to sessionStorage so a page reload keeps the
 * conversation (and its server-side session) intact. sessionStorage is scoped
 * to the tab, so the history clears naturally when the tab closes.
 */
const STORAGE_PREFIX = "swiftagent:chat:";
const SCHEMA_VERSION = 1;

interface PersistedChat {
  v: number;
  sessionId: string;
  messages: ChatMsg[];
}

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

/**
 * Local object URLs (blob:) don't survive a reload, so an attachment is only
 * persistable once its upload finished and we have the hosted Cloudinary URL.
 * Rewrite the preview `url` to that hosted URL and drop the upload lifecycle so
 * a restored attachment renders as a ready thumbnail.
 */
function persistableAttachments(
  attachments?: ChatAttachment[],
): ChatAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  const kept = attachments
    .filter((file) => !!file.uploaded?.url)
    .map((file) => ({
      ...file,
      url: file.uploaded!.url,
      status: "ready" as const,
      errorMessage: undefined,
    }));
  return kept.length ? kept : undefined;
}

export function loadChatState(
  companyId: string,
): { sessionId: string; messages: ChatMsg[] } | null {
  if (!companyId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChat;
    if (
      parsed?.v !== SCHEMA_VERSION ||
      !parsed.sessionId ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }
    return { sessionId: parsed.sessionId, messages: parsed.messages };
  } catch {
    return null;
  }
}

export function saveChatState(
  companyId: string,
  sessionId: string,
  messages: ChatMsg[],
): void {
  if (!companyId || typeof sessionStorage === "undefined") return;
  // Drop the incomplete agent placeholder so a reload mid-stream doesn't
  // restore a stuck spinner.
  const persistable = messages
    .filter((msg) => !msg.pending)
    .map((msg) => ({
      ...msg,
      attachments: persistableAttachments(msg.attachments),
    }));
  const payload: PersistedChat = {
    v: SCHEMA_VERSION,
    sessionId,
    messages: persistable,
  };
  try {
    sessionStorage.setItem(storageKey(companyId), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable (private mode) — persistence is best-effort.
  }
}

export function clearChatState(companyId: string): void {
  if (!companyId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(companyId));
  } catch {
    // ignore
  }
}
