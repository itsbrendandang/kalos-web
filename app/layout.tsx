import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

// Satoshi (Fontshare Font License, files under app/fonts/) is the product
// typeface, matching the Voyager v3 prototype. One variable font covers the
// full weight range.
const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.woff2",
  variable: "--font-satoshi",
  weight: "300 900",
  display: "swap",
});
// JetBrains Mono (SIL OFL 1.1, files under app/fonts/) is the tabular/mono
// face, self-hosted so the build never fetches from Google Fonts. The range
// is pinned to 500-600: the app only ever loaded those two weights, so a
// normal-weight request renders at 500 and a bold one at 600, as before.
const jbmono = localFont({
  src: "./fonts/JetBrainsMono-Variable.ttf",
  variable: "--font-jbmono",
  weight: "500 600",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${jbmono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
