import axios from "axios";
import { useEffect } from "react";

import { localApiClient } from "../lib/api-client";

/**
 * Module-level guard so re-mounts never re-log.
 */
const loggedCompanies = new Set<string>();

/**
 * Logs a visitor the first time the widget loads for a given company.
 * Uses both a module-level Set (survives re-mounts) and sessionStorage
 * (survives page navigations) to avoid re-logging.
 * Silently fails — visitor logging is non-critical.
 */
export function useVisitorLog(companyId: string) {
  useEffect(() => {
    if (loggedCompanies.has(companyId)) return;

    const logVisitorIfNew = async () => {
      try {
        const sessionKey = `swift_agent_visited_${companyId}`;
        if (sessionStorage.getItem(sessionKey)) {
          loggedCompanies.add(companyId);
          return;
        }
      } catch {
        // sessionStorage may not be available in cross-origin contexts
      }

      loggedCompanies.add(companyId);

      try {
        const { data: ipData } = await axios.get(
          "https://api.ipify.org?format=json",
        );
        if (ipData.ip) {
          await localApiClient.post("/api/v1/visitors", {
            company_id: companyId,
            ip_address: ipData.ip,
          });
          try {
            sessionStorage.setItem(`swift_agent_visited_${companyId}`, "true");
          } catch {
            // ignore
          }
        }
      } catch {
        // Silently fail — visitor logging is non-critical
      }
    };

    logVisitorIfNew();
  }, [companyId]);
}
