import { readFileSync } from "node:fs";
import type { GenerationOutcome } from "./grading.js";

// The door speaks Streamable HTTP MCP (protocol 2025-06-18, hearth 1.28.1). Every response — even a
// tool result — arrives SSE-framed, so unwrapping is a double parse:
//   `data: ` line -> JSON-RPC envelope -> result.content[0].text -> JSON.parse that string.
// The pure functions below are separated from the network so the framing can be tested against
// recorded fixtures rather than a live door.

export type UnwrapResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** Collect every `data:` line in an SSE body and JSON-parse each one. */
export function parseSseDataLines(body: string): unknown[] {
  const parsed: unknown[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payload = rawLine.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      parsed.push(JSON.parse(payload));
    } catch {
      // A non-JSON data line is not fatal on its own; the caller reports it as missing framing.
    }
  }
  return parsed;
}

export function unwrapToolResult(body: string): UnwrapResult {
  const messages = parseSseDataLines(body);
  if (!messages.length) return { ok: false, error: "no_sse_data_frame" };

  const envelope = messages.find(
    (message): message is Record<string, unknown> =>
      Boolean(message) && typeof message === "object" && ("result" in (message as object) || "error" in (message as object))
  );
  if (!envelope) return { ok: false, error: "no_jsonrpc_response" };

  if (envelope.error) return { ok: false, error: `jsonrpc_error:${JSON.stringify(envelope.error)}` };

  const result = envelope.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | undefined;
  if (!result) return { ok: false, error: "missing_result" };
  // Transport-level failure flag. Distinct from the tool payload's own `ok`.
  if (result.isError) return { ok: false, error: "tool_is_error" };

  const text = result.content?.find((entry) => entry.type === "text")?.text;
  if (typeof text !== "string") return { ok: false, error: "missing_text_content" };

  try {
    const payload = JSON.parse(text) as unknown;
    if (!payload || typeof payload !== "object") return { ok: false, error: "payload_not_object" };
    return { ok: true, payload: payload as Record<string, unknown> };
  } catch {
    return { ok: false, error: "payload_not_json" };
  }
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export type GenerateArgs = {
  prompt: string;
  system?: string;
  backend: string;
  timeoutS: number;
  /** Omit on the gemini rungs — a tight cap yields `ok:true` with empty text. */
  maxTokens?: number;
};

export function resolveHearthConfig(): { url: string; key: string } {
  const url = process.env.HEARTH_URL ?? "http://127.0.0.1:8710/mcp";
  let key = process.env.HEARTH_KEY ?? "";
  // Convenience for local runs: read the key from an existing .mcp.json instead of exporting it.
  // The path is supplied by env so no machine-specific path is baked into the repository.
  const configPath = process.env.HEARTH_MCP_CONFIG;
  if (!key && configPath) {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }>;
    };
    key = config.mcpServers?.hearth?.headers?.["X-Hearth-Key"] ?? "";
  }
  if (!key) throw new Error("hearth_key_missing: set HEARTH_KEY or HEARTH_MCP_CONFIG");
  return { url, key };
}

export class HearthClient {
  private sessionId: string | null = null;

  constructor(private readonly url: string, private readonly key: string) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Hearth-Key": this.key,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json"
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    return headers;
  }

  /** initialize -> capture Mcp-Session-Id -> notifications/initialized. */
  async connect(): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "landscape-bank", version: "0.1.0" }
        }
      })
    });
    if (!response.ok) throw new Error(`hearth_initialize_failed:${response.status}`);
    const sessionId = response.headers.get("mcp-session-id");
    if (!sessionId) throw new Error("hearth_initialize_missing_session");
    await response.text();
    this.sessionId = sessionId;

    const ack = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    });
    if (ack.status !== 202 && !ack.ok) throw new Error(`hearth_initialized_failed:${ack.status}`);
    await ack.text();
  }

  async generate(args: GenerateArgs, requestId: number): Promise<GenerationOutcome> {
    const startedAt = Date.now();
    const failure = (error: string): GenerationOutcome => ({
      ok: false,
      text: "",
      backend: args.backend,
      model: "",
      endpoint: "",
      routedBy: "",
      latencyMs: Date.now() - startedAt,
      transportError: error
    });

    let body: string;
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "tools/call",
          params: {
            name: "local_generate",
            arguments: {
              prompt: args.prompt,
              ...(args.system ? { system: args.system } : {}),
              backend: args.backend,
              timeout_s: args.timeoutS,
              ...(args.maxTokens ? { max_tokens: args.maxTokens } : {})
            }
          }
        })
      });
      if (!response.ok) return failure(`http_${response.status}`);
      body = await response.text();
    } catch (error) {
      return failure(`fetch_failed:${(error as Error).message}`);
    }

    const unwrapped = unwrapToolResult(body);
    if (!unwrapped.ok) return failure(unwrapped.error);

    const payload = unwrapped.payload;
    return {
      // The tool's own success flag, which is not the same thing as a usable reply — an `ok:true`
      // with empty text is graded `empty_output`, not as a wrong answer.
      ok: payload.ok === true,
      text: readString(payload, "text"),
      backend: readString(payload, "backend") || args.backend,
      model: readString(payload, "model"),
      endpoint: readString(payload, "endpoint"),
      routedBy: readString(payload, "routed_by"),
      latencyMs: typeof payload.duration_ms === "number" ? payload.duration_ms : Date.now() - startedAt
    };
  }
}
