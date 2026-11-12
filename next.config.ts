import type { NextConfig } from "next";

// The site's pages are plain HTML files in /public. These rules give them clean addresses:
//   /            -> index.html
//   /paket       -> paket.html
//   /flyttfirma-orebro -> flyttfirma-orebro.html
const pages = [
  "tjanster", "flyttfirma", "paket", "om-oss", "radgivare", "integritetspolicy", "villkor",
  "flyttfirma-kungsor", "flyttfirma-orebro", "flyttfirma-eskilstuna", "flyttfirma-vasteras", "flyttfirma-katrineholm",
  "flyttfirma-karlstad", "flyttfirma-sodertalje", "flyttfirma-akersberga", "flyttfirma-norrtalje", "flyttfirma-nykoping", "flyttfirma-norrkoping", "flyttfirma-linkoping", "flyttfirma-motala", "flyttfirma-mjolby", "flyttfirma-jonkoping", "flyttfirma-nassjo", "flyttfirma-tranas", "flyttfirma-vastervik", "flyttfirma-vimmerby", "flyttfirma-ludvika", "flyttstad", "kubikraknare", "rut-avdrag", "dodsbo", "utlandsflytt",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        ...pages.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
      ],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
