// POST /api/chat – the website assistant. Body: { messages: [{ role, content }] }
import { askClaude, cleanMessages, ChatInputError } from "@/lib/assistant/chat.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";
import { systemPrompt } from "@/lib/assistant/facts.ts";
import { getPrices } from "@/lib/pricing/current.ts";
import { quoteRoute, RAKNA_FLYTT_TOOL } from "@/lib/assistant/distance.ts";

export const runtime = "nodejs";

// Last error kind (status code only, never customer text) – shown by GET for troubleshooting.
let lastError: { at: string; kind: string } | null = null;

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
    const prices = await getPrices();
    // The assistant can count distance and price between two towns, exactly like the price calculator.
    const tools = [{ def: RAKNA_FLYTT_TOOL, run: (input: Record<string, unknown>) => quoteRoute(input, prices) }];
    const reply = await askClaude(messages, apiKey, fetch, systemPrompt(prices), tools);
    return Response.json({ reply });
  } catch (e) {
    if (e instanceof ChatInputError) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    console.error("chat failed", e instanceof Error ? e.message : e);   // no customer text in logs
    const m = e instanceof Error ? /Claude API (\d+)/.exec(e.message) : null;
    lastError = { at: new Date().toISOString(), kind: m ? `claude_${m[1]}` : (e instanceof Error ? (e.message.startsWith("empty reply") ? e.message : e.name) : "unknown") };
    return Response.json({ fallback: true }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY), lastError });
}
