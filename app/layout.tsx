// The website's pages are plain HTML in /public (built from site-src/). This layout exists only so that
// Next.js can show our own "page not found" (app/not-found.tsx) instead of its built-in English one.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
