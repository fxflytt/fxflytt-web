// POST /api/chat – the website assistant. Body: { messages: [{ role, content }] }
import { askClaude, cleanMessages, ChatInputError } from "@/lib/assistant/chat.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not configured yet: the chat bubble falls back to its built-in answers.
    return Response.json({ fallback: true }, { status: 503 });
  }
  const ip = clientIp(req);
  if (rateLimited("chat-min:" + ip, 10, 60_000) || rateLimited("chat-day:" + ip, 150, 86_400_000)) {
    return Response.json({ error: "Du har skickat många meddelanden. Ring oss gärna på 076-300 07 23." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }
  try {
    const messages = cleanMessages((body as { messages?: unknown })?.messages);
    const reply = await askClaude(messages, apiKey);
    return Response.json({ reply });
  } catch (e) {
    if (e instanceof ChatInputError) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    console.error("chat failed", e instanceof Error ? e.message : e);   // no customer text in logs
    return Response.json({ fallback: true }, { status: 502 });
  }
}
