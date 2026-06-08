import { useEffect } from "react";

import { getBaseUrl, localApiClient } from "../lib/api-client";

/**
 * Module-level guard so re-mounts never re-log the initial visit.
 */
const loggedCompanies = new Set<string>();

/** How often to report accumulated duration while the widget is open. */
const HEARTBEAT_MS = 20_000;

/**
 * Logs a visitor when the widget loads and tracks how long they stay.
 *
 * - The initial visit is logged once per session (no body), as before.
 * - Session duration is owned by the widget — the only place that witnesses
 *   both ends of the visit. We POST `duration_seconds` to the same
 *   `/visitors/log` endpoint on a heartbeat and on page-hide; the backend
 *   keeps the max for the visitor, so out-of-order reports never shrink it.
 * - The session start is kept in sessionStorage so the duration accumulates
 *   across same-tab page navigations rather than resetting each mount.
 *
 * Silently fails throughout — visitor logging is non-critical.
 */
export function useVisitorLog(companyId: string) {
  useEffect(() => {
    if (!companyId) return;

    const visitedKey = `swift_agent_visited_${companyId}`;
    const startKey = `swift_agent_session_start_${companyId}`;
    const logEndpoint = `/api/v1/dashboard/${encodeURIComponent(
      companyId,
    )}/visitors/log`;

    // Session start time, persisted so duration spans the whole visit (across
    // in-site navigations) instead of restarting on every widget mount.
    let startedAt = Date.now();
    try {
      const stored = sessionStorage.getItem(startKey);
      if (stored) {
        startedAt = Number(stored) || startedAt;
      } else {
        sessionStorage.setItem(startKey, String(startedAt));
      }
    } catch {
      // sessionStorage may be unavailable in cross-origin contexts
    }

    // Log the visit once per session (no body) — unchanged behaviour.
    const logVisitIfNew = async () => {
      if (loggedCompanies.has(companyId)) return;
      loggedCompanies.add(companyId);

      try {
        if (sessionStorage.getItem(visitedKey)) return;
      } catch {
        // sessionStorage may not be available in cross-origin contexts
      }

      try {
        // The server resolves the visitor IP from the request, so no body.
        await localApiClient.post(logEndpoint);
        try {
          sessionStorage.setItem(visitedKey, "true");
        } catch {
          // ignore
        }
      } catch {
        // Silently fail — visitor logging is non-critical
      }
    };

    logVisitIfNew();

    const elapsedSeconds = () =>
      Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

    // Heartbeat report — survives long sessions that never fire a clean unload.
    const reportDuration = () => {
      const duration_seconds = elapsedSeconds();
      if (duration_seconds <= 0) return;
      localApiClient.post(logEndpoint, { duration_seconds }).catch(() => {
        // Silently fail — non-critical
      });
    };

    // Unload report — sendBeacon survives the page actually closing, where a
    // normal fetch/xhr would be cancelled mid-flight.
    const beaconDuration = () => {
      const duration_seconds = elapsedSeconds();
      if (duration_seconds <= 0) return;
      try {
        const base = localApiClient.defaults.baseURL || getBaseUrl() || "";
        const blob = new Blob([JSON.stringify({ duration_seconds })], {
          type: "application/json",
        });
        navigator.sendBeacon(`${base}${logEndpoint}`, blob);
      } catch {
        // ignore — best effort
      }
    };

    const interval = setInterval(reportDuration, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") beaconDuration();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", beaconDuration);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", beaconDuration);
      beaconDuration();
    };
  }, [companyId]);
}
