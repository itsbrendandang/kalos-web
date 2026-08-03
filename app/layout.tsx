import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
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
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Bioqore",
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
