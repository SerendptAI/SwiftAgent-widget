import { useEffect } from "react";

import { apiKeyHeaders, localApiClient } from "../lib/api-client";

/**
 * Backend router behind every tool below. The company is resolved server-side
 * from the widget API key, so no tool sends the company id itself.
 */
const WEBMCP_PATH = "/webmcp";

interface ToolInputSchema {
  type: "object";
  properties: Record<string, { type: "string"; description: string }>;
  required?: string[];
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * The slice of `navigator.modelContext` the widget relies on, per the WebMCP
 * proposal (https://github.com/webmachinelearning/webmcp). `unregisterTool`
 * is optional because early browser builds may not ship it.
 */
interface ModelContext {
  registerTool(tool: WebMcpTool): void;
  unregisterTool?(name: string): void;
}

interface ToolSpec {
  name: string;
  description: string;
  method: "GET" | "POST";
  endpoint: string;
  inputSchema: ToolInputSchema;
}

const NO_INPUT: ToolInputSchema = { type: "object", properties: {} };

const TOOLS: ToolSpec[] = [
  {
    name: "swiftagents_diagnose_crypto_tx",
    description:
      "Diagnoses a blockchain transaction hash for errors or status across EVM and BTC chains",
    method: "POST",
    endpoint: "/diagnose",
    inputSchema: {
      type: "object",
      properties: {
        tx_hash: { type: "string", description: "The transaction hash" },
        chain: {
          type: "string",
          description:
            "The blockchain network (e.g., 'ethereum', 'bitcoin', 'polygon')",
        },
      },
      required: ["tx_hash", "chain"],
    },
  },
  {
    name: "swiftagents_query_knowledge_base",
    description:
      "Semantically searches the company's knowledge base for documentation and answers",
    method: "POST",
    endpoint: "/query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "swiftagents_get_navigation_map",
    description:
      "Fetches the master Navigation Graph (NavGraph) showing all pages and interactions available on the company dashboard",
    method: "GET",
    endpoint: "/navigation",
    inputSchema: NO_INPUT,
  },
  {
    name: "swiftagents_get_dashboard_stats",
    description:
      "Fetches live analytics and statistics from the SwiftAgents dashboard",
    method: "GET",
    endpoint: "/stats",
    inputSchema: NO_INPUT,
  },
  {
    name: "swiftagents_get_recent_visitors",
    description:
      "Fetches a list of the most recent visitors to the customer's website",
    method: "GET",
    endpoint: "/visitors",
    inputSchema: NO_INPUT,
  },
];

/**
 * Registers the SwiftAgents tools with the browser's WebMCP surface so an
 * agent driving the page (e.g. the ChatGPT desktop app) can call the backend
 * directly. No-op where the browser has no `navigator.modelContext`.
 */
export function useWebMCP() {
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;

    for (const spec of TOOLS) {
      try {
        modelContext.registerTool({
          name: spec.name,
          description: spec.description,
          inputSchema: spec.inputSchema,
          execute: (input) => callTool(spec, input),
        });
      } catch (error) {
        // The API is experimental and this runs on customers' pages: a
        // registration failure must not take the chat widget down with it.
        console.error(`WebMCP: failed to register ${spec.name}`, error);
      }
    }

    return () => {
      for (const spec of TOOLS) modelContext.unregisterTool?.(spec.name);
    };
  }, []);
}

function getModelContext(): ModelContext | null {
  if (typeof navigator === "undefined") return null;
  const { modelContext } = navigator as Navigator & {
    modelContext?: ModelContext;
  };
  return modelContext ?? null;
}

async function callTool(
  spec: ToolSpec,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { data } = await localApiClient.request<unknown>({
      method: spec.method,
      url: `${WEBMCP_PATH}${spec.endpoint}`,
      data: spec.method === "POST" ? input : undefined,
      headers: apiKeyHeaders(),
    });
    return textResult(JSON.stringify(data ?? null, null, 2));
  } catch (error) {
    return textResult(`Error: ${describeError(error)}`);
  }
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
