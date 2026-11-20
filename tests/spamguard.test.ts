import { test } from "node:test";
import assert from "node:assert/strict";
import { guard, phoneKey, suspectNote, LIMITS } from "../lib/spamGuard.ts";

// Without Upstash (as in the tests) the counters live in memory – same rules.
test("tidsfälla: skickat på under 3 sekunder ignoreras tyst", async () => {
  assert.deepEqual(await guard("offer", "1.1.1.1", 800, "0701111111"), { action: "drop" });
});

test("utan tidsstämpel: tas emot men markeras som möjlig spam", async () => {
  const g = await guard("offer", "1.1.1.2", undefined, "0702222222");
  assert.equal(g.action, "ok"); assert.equal((g as any).suspicious, true);
  assert.match(suspectNote((g as any).reason), /Möjlig spam: skickad utan formulärets tidsstämpel/);
});

test("samma telefonnummer: en förfrågan per timme och formulär", async () => {
  assert.equal((await guard("kontakt", "1.1.1.3", 9000, "070-333 33 33")).action, "ok");
  const again = await guard("kontakt", "1.1.1.4", 9000, "+46 70 333 33 33");
  assert.equal(again.action, "block");
  assert.match((again as any).error, /redan fått en förfrågan/);
  assert.equal(phoneKey("+46 70 333 33 33"), phoneKey("070-333 33 33"));
});

test("samma enhet: högst 5 förfrågningar per 10 minuter", async () => {
  const res = [];
  for (let i = 0; i < 6; i++) res.push((await guard("lead", "2.2.2.2", 9000, "07044400" + i + "0")).action);
  assert.deepEqual(res, ["ok", "ok", "ok", "ok", "ok", "block"]);
});

test("hela sajten: fler än 30 i timmen markeras och ger ett larm en gång", async () => {
  const alerts: boolean[] = [], susp: boolean[] = [];
  for (let i = 0; i < LIMITS.sitePerHour + 5; i++) {
    const g = await guard("offer", "3.3." + i + ".1", 9000, "07355" + String(i).padStart(5, "0")) as any;
    alerts.push(!!g.alert); susp.push(!!g.suspicious);
  }
  assert.equal(alerts.filter(Boolean).length <= 1, true);
  assert.equal(susp[susp.length - 1], true);
});
