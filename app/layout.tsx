import type { Metadata } from "next";
import { IBM_Plex_Mono, JetBrains_Mono, Newsreader } from "next/font/google";
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

// Newsreader and IBM Plex Mono for the campaign-workspace redesign (reading
// copy and data/mono roles respectively - see DESIGN.md "Fonts, one more
// time"). These are loaded via next/font/google, NOT next/font/local, even
// though DESIGN.md's existing rule is "self-host, do not download font files
// from unverified sources." Do not "fix" this back to a localFont + .woff2
// download: next/font/google already downloads the font files and CSS at
// BUILD time and self-hosts them from this app's own origin - the browser
// never makes a request to Google, exactly like the JetBrains Mono line
// above. It satisfies the self-hosting requirement without needing us to
// go source a .woff2 file from a third party and vendor it (and its
// license) into app/fonts/ by hand. Newsreader is a variable optical-size
// font; the opsz axis is requested to match the design's own Google Fonts
// import (`opsz,wght@6..72`), so headline vs. caption sizes get distinct
// optical cuts instead of one cut scaled uniformly. next/font/google only
// allows requesting extra axes when weight is left as "variable" (the
// default) rather than a fixed list of stops - the design's 400/500/600
// weights are still fully reachable, since a variable font accepts any
// font-weight in its range, not just discrete stops.
const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibmplexmono",
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
      className={`${satoshi.variable} ${jbmono.variable} ${newsreader.variable} ${ibmPlexMono.variable} antialiased`}
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
