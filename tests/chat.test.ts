import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMessages, redact, askClaude, ChatInputError, MODEL } from "../lib/assistant/chat.ts";
import { SYSTEM_PROMPT } from "../lib/assistant/facts.ts";

test("cleanMessages keeps the last 12 turns, trims long text, requires a user turn last", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(2000) }));
  many.push({ role: "user", content: "hej" });
  const out = cleanMessages(many);
  assert.ok(out.length <= 12);
  assert.equal(out[0].role, "user");
  assert.equal(out[out.length - 1].content, "hej");
  assert.ok(out.every((m) => m.content.length <= 1000));
  assert.throws(() => cleanMessages([]), ChatInputError);
  assert.throws(() => cleanMessages([{ role: "system", content: "x" }]), ChatInputError);
  assert.throws(() => cleanMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]), ChatInputError);
});

test("redact removes personal numbers and card numbers before sending", () => {
  assert.equal(redact("mitt pnr är 19900101-1234 ok"), "mitt pnr är [borttaget nummer] ok");
  assert.equal(redact("9001011234"), "[borttaget nummer]");
  assert.ok(!redact("kort 4111 1111 1111 1111").includes("4111"));
  assert.equal(redact("2 rok på 65 m²"), "2 rok på 65 m²");
});

test("askClaude sends the system prompt, model and redacted messages; returns text", async () => {
  let sent: any;
  const fake = (async (_url: string, init: any) => {
    sent = JSON.parse(init.body);
    assert.equal(init.headers["x-api-key"], "test-key");
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Hej! 695 kr/tim efter RUT." }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const reply = await askClaude([{ role: "user", content: "pnr 19900101-1234, vad kostar det?" }], "test-key", fake);
  assert.equal(reply, "Hej! 695 kr/tim efter RUT.");
  assert.equal(sent.model, MODEL);
  assert.ok(sent.system[0].text.includes("Frejgatan 9B"));
  assert.ok(!JSON.stringify(sent.messages).includes("19900101"));
});

test("askClaude throws on API errors (the route then falls back)", async () => {
  const fake = (async () => new Response("overloaded", { status: 529 })) as unknown as typeof fetch;
  await assert.rejects(() => askClaude([{ role: "user", content: "hej" }], "k", fake));
});

test("system prompt forbids inventing prices and asking for personnummer", () => {
  assert.ok(SYSTEM_PROMPT.includes("Hitta aldrig på priser"));
  assert.ok(SYSTEM_PROMPT.includes("Be ALDRIG om personnummer"));
});
