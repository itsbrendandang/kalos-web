import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthFrame } from "@/components/auth/auth-frame";
import { resolveSession } from "@/lib/server/session";

// Geist (UI and text) and Geist Mono (code-like values only), SIL OFL 1.1,
// self-hosted from app/fonts/ so the build never fetches a font. The files are
// the vercel/geist-font v1.7.2 variable webfonts, renamed only - see DESIGN.md
// "Fonts" for the blob hashes. Numbers use Geist with tabular-nums, not mono.
const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kalos",
  description: "Bayesian optimization for bioprocess development",
};

// Sets `dark` on <html> before first paint, based on a saved preference or
// the OS setting, so there is no flash of the wrong theme. Runs
// synchronously as the browser parses <head>, ahead of hydration - see
// node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

// Every request resolves the session server-side (Better Auth DB lookup, MFA,
// membership from the member table); AuthFrame then picks the frame or
// redirects. Pages that read data must still check for themselves.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { status } = await resolveSession();
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <AuthFrame state={status}>{children}</AuthFrame>
      </body>
    </html>
  );
}
