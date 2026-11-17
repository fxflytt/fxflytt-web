// "Sidan finns inte" for unknown addresses. The page itself is site-src/404.html (same header, footer and
// styles as the rest of the site); it is read when the site is built and shown without its scripts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "public", "404.html"), "utf8");
const pick = (re: RegExp) => (src.match(re) || [])[1] || "";
const title = pick(/<title>([\s\S]*?)<\/title>/).replace(/&amp;/g, "&");
const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
  + "\n.burger,.drawer{display:none!important}";   // the mobile menu needs scripts; the page links are enough here
const body = pick(/<body[^>]*>([\s\S]*)<\/body>/)
  .replace(/<script\b[\s\S]*?<\/script>/g, "")
  .replace(/href="(?:\/)?([a-z0-9-]+)\.html(#[^"]*)?"/g, (_m, p: string, h = "") => `href="${p === "index" ? "/" : "/" + p}${h}"`)
  .replace('<span id="yr"></span>', String(new Date().getFullYear()));

export const metadata = { title, robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <link rel="preload" href="/fonts/plus-jakarta-sans-latin-v5.woff2" as="font" type="font/woff2" crossOrigin="" />
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
