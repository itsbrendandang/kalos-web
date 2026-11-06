import type { Metadata } from "next";
import "./globals.css";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ViewerProvider } from "@/components/auth/viewer";
import { isLocalMode } from "@/lib/local-mode";
import { resolveSession } from "@/lib/server/session";
import { viewerFrom, type Viewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Kalos",
  description: "Kalos plans the next runs for your bioprocess from the runs you have measured",
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
  const session = isLocalMode() ? null : await resolveSession();
  const viewer: Viewer = session ? viewerFrom(session) : { kind: "local" };
  const status = session ? session.status : ("ok" as const);
  return (
    <html
      lang="en"
      className="antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <ViewerProvider viewer={viewer}>
          <AuthFrame state={status}>{children}</AuthFrame>
        </ViewerProvider>
      </body>
    </html>
  );
}
