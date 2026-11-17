// Calls Claude for the website assistant. Used by /api/chat. The API key is read from the
// server environment (ANTHROPIC_API_KEY) and never reaches the browser.
import { SYSTEM_PROMPT } from "./facts.ts";
// The route passes a system prompt built from the price list in use (systemPrompt(prices)).

export const MODEL = "claude-haiku-5-5";
export const MAX_TURNS = 12;
export const MAX_CHARS_PER_MESSAGE = 1000;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class ChatInputError extends Error {}

/** Validates and trims the conversation sent by the browser. */
export function cleanMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ChatInputError("messages required");
  const msgs = raw.slice(-MAX_TURNS).map((m) => {
    if (!m || typeof m !== "object") throw new ChatInputError("bad message");
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") throw new ChatInputError("bad role");
    if (typeof content !== "string" || !content.trim()) throw new ChatInputError("empty message");
    return { role, content: content.slice(0, MAX_CHARS_PER_MESSAGE) } as ChatMessage;
  });
  while (msgs.length && msgs[0].role !== "user") msgs.shift();   // API needs a user turn first
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new ChatInputError("last message must be from the user");
  return msgs;
}

/** Removes things that look like Swedish personal numbers or card numbers before they leave our server. */
export function redact(text: string): string {
  return text
    .replace(/\b(19|20)?\d{6}[-+ ]?\d{4}\b/g, "[borttaget nummer]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[borttaget nummer]");
}

/** A tool the assistant may call: its definition for the API, and the server function that answers it. */
export type ChatTool = { def: { name: string; description: string; input_schema: object }; run: (input: Record<string, unknown>) => unknown };
const MAX_TOOL_ROUNDS = 3;

export async function askClaude(messages: ChatMessage[], apiKey: string, fetchImpl: typeof fetch = fetch, system: string = SYSTEM_PROMPT, tools: ChatTool[] = []): Promise<string> {
  // Conversation sent to the API; tool calls and their results are added here between rounds.
  type Block = { type: string; [k: string]: unknown };
  const convo: { role: string; content: string | Block[] }[] = messages.map((m) => ({ role: m.role, content: redact(m.content) }));
  for (let round = 0; ; round++) {
    const data = await callApi(convo, apiKey, fetchImpl, system, round < MAX_TOOL_ROUNDS ? tools : []);
    const blocks = (data.content ?? []) as Block[];
    const calls = blocks.filter((b) => b.type === "tool_use");
    if (data.stop_reason === "tool_use" && calls.length && round < MAX_TOOL_ROUNDS) {
      convo.push({ role: "assistant", content: blocks });
      convo.push({ role: "user", content: calls.map((c) => {
        const tool = tools.find((t) => t.def.name === c.name);
        let result: unknown;
        try { result = tool ? tool.run((c.input ?? {}) as Record<string, unknown>) : { error: "okänt verktyg" }; }
        catch (e) { result = { error: e instanceof Error ? e.message : "fel" }; }
        return { type: "tool_result", tool_use_id: c.id as string, content: JSON.stringify(result) };
      }) });
      continue;
    }
    const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("").trim();
    if (!text) {
      const types = blocks.map((b) => b.type).join("+") || "none";
      throw new Error(`empty reply (stop=${data.stop_reason ?? "?"}, blocks=${types})`);
    }
    return text;
  }
}

async function callApi(convo: unknown[], apiKey: string, fetchImpl: typeof fetch, system: string, tools: ChatTool[]) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      // The fixed instructions are cached between requests, which makes each chat cheaper.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: convo,
      ...(tools.length ? { tools: tools.map((t) => t.def) } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 300)}`);
  }
  return await res.json() as { content?: { type: string; [k: string]: unknown }[]; stop_reason?: string };
}
