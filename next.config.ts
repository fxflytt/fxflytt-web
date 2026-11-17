import type { NextConfig } from "next";

// The site's pages are plain HTML files in /public. These rules give them clean addresses:
//   /            -> index.html
//   /paket       -> paket.html
//   /flyttfirma-orebro -> flyttfirma-orebro.html
const pages = [
  "tjanster", "flyttfirma", "paket", "om-oss", "radgivare", "integritetspolicy", "villkor",
  "flyttfirma-kungsor", "flyttfirma-orebro", "flyttfirma-eskilstuna", "flyttfirma-vasteras", "flyttfirma-katrineholm",
  "flyttfirma-karlstad", "flyttfirma-sodertalje", "flyttfirma-akersberga", "flyttfirma-norrtalje", "flyttfirma-nykoping", "flyttfirma-norrkoping", "flyttfirma-linkoping", "flyttfirma-motala", "flyttfirma-mjolby", "flyttfirma-jonkoping", "flyttfirma-nassjo", "flyttfirma-tranas", "flyttfirma-vastervik", "flyttfirma-vimmerby", "flyttfirma-ludvika", "flyttfirma-arboga", "flyttfirma-koping", "flyttfirma-kumla", "flyttfirma-karlskoga", "flyttfirma-strangnas", "flyttfirma-enkoping", "flyttfirma-uppsala", "flyttfirma-stockholm", "flyttstad", "kubikraknare", "rut-avdrag", "dodsbo", "utlandsflytt", "vad-kostar-flytt", "kontorsflytt", "magasinering", "pianoflytt", "flytthjalp", "bohagsflytt", "packning", "bortforsling", "en", "admin", "signera", "arbetsorder", "jobb", "offert",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const config: NextConfig = {
  // Old addresses with .html move permanently to the clean ones, so Google keeps one address per page.
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      ...pages.filter((p) => !["admin", "signera", "arbetsorder", "jobb", "offert"].includes(p)).map((p) => ({ source: `/${p}.html`, destination: `/${p}`, permanent: true })),
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/jobb/order", destination: "/arbetsorder.html" },   // job sheet inside the crew app
        ...pages.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
      ],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The font file has its version in the name, so browsers may keep it for a year.
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Photos: kept a week, then checked again (the names stay the same when a photo is replaced).
      { source: "/img/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default config;
