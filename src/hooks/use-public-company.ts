import { useEffect, useState } from "react";

import { localApiClient } from "../lib/api-client";

interface Company {
  id: string;
  name: string;
  logo_url: string;
  website: string;
  industry: string;
  description: string;
  [key: string]: unknown;
}

/**
 * Module-level cache — survives component re-mounts AND failed fetches.
 * Once a fetch is attempted for a companyId, it is NEVER retried.
 */
const companyCache = new Map<string, Company | null>();

function fetchCompanyOnce(companyId: string): Promise<Company | null> {
  if (companyCache.has(companyId)) {
    return Promise.resolve(companyCache.get(companyId) ?? null);
  }

  // Mark as in-flight immediately (null = attempted but no data yet)
  companyCache.set(companyId, null);

  return localApiClient
    .get<Company>(`/api/v1/companies/${companyId}/public`)
    .then((res) => {
      companyCache.set(companyId, res.data);
      return res.data;
    })
    .catch(() => {
      // Keep the null sentinel — never retry
      return null;
    });
}

export function usePublicCompanyQuery(companyId: string | null | undefined) {
  const [data, setData] = useState<Company | undefined>(() =>
    companyId ? (companyCache.get(companyId) ?? undefined) : undefined,
  );

  useEffect(() => {
    if (!companyId) return;

    // Already have data or already attempted
    if (companyCache.has(companyId)) {
      const cached = companyCache.get(companyId);
      if (cached) setData(cached);
      return;
    }

    fetchCompanyOnce(companyId).then((result) => {
      if (result) setData(result);
    });
  }, [companyId]);

  return { data };
}
