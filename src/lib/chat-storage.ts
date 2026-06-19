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
 * Safely resolve sessionStorage. Merely *accessing* `sessionStorage` throws a
 * SecurityError on some embeds (sandboxed/partitioned contexts, blocked
 * cookies), so a `typeof` guard isn't enough — it must be wrapped.
 */
function getStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
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
  const store = getStore();
  if (!companyId || !store) return null;
  try {
    const raw = store.getItem(storageKey(companyId));
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
  const store = getStore();
  if (!companyId || !store) return;
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
    store.setItem(storageKey(companyId), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable (private mode) — persistence is best-effort.
  }
}

export function clearChatState(companyId: string): void {
  const store = getStore();
  if (!companyId || !store) return;
  try {
    store.removeItem(storageKey(companyId));
  } catch {
    // ignore
  }
}
