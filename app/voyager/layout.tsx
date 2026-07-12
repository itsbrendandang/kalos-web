import type { Metadata } from "next";
import localFont from "next/font/local";
import "./voyager.css";

// Satoshi is the prototype's typeface, now self-hosted via next/font/local from
// the Fontshare Font License files under app/fonts/. Exported as --font-voyager
// so voyager.css needs no change.
const satoshi = localFont({
  src: "../fonts/Satoshi-Variable.woff2",
  variable: "--font-voyager",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Voyager",
  description: "Closed-loop bioprocess optimization — customer projects",
};

// Voyager now renders inside the shared AppShell sidebar (see components/app-shell.tsx)
// instead of carrying its own top bar - this wrapper only keeps the voyager-root
// token scope and the Satoshi font variable that the ported component styles expect.
export default function VoyagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`voyager-root ${satoshi.variable}`}>
      <div className="mx-auto max-w-[1120px] px-6 py-7">{children}</div>
    </div>
  );
}
