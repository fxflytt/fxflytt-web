// Calls Claude for the website assistant. Used by /api/chat. The API key is read from the
// server environment (ANTHROPIC_API_KEY) and never reaches the browser.
import { SYSTEM_PROMPT } from "./facts.ts";

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

export async function askClaude(messages: ChatMessage[], apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      // The fixed instructions are cached between requests, which makes each chat cheaper.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: messages.map((m) => ({ role: m.role, content: redact(m.content) })),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json() as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new Error("empty reply");
  return text;
}
