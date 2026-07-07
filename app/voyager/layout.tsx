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

function TopNav() {
  return (
    <header className="flex items-center justify-between border-b border-[color:var(--v-border)] bg-[var(--v-bg)] px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="size-3.5 rounded-full bg-[var(--v-blue)]" aria-hidden />
        <span className="text-[13px] font-bold tracking-[-0.3px] text-[color:var(--v-ink)]">Voyager</span>
      </div>
      <button className="flex items-center gap-2 rounded-full border-[0.5px] border-[color:var(--v-border)] py-[3px] pr-3 pl-1 transition-colors hover:border-[color:var(--v-blue-border)]">
        <span className="grid size-5 place-items-center rounded-full bg-[var(--v-blue-tint)] text-[9px] font-medium text-[color:var(--v-blue-7)]">
          SR
        </span>
        <span className="text-[11px] font-medium text-[color:var(--v-ink)]">S. Rodriguez</span>
      </button>
    </header>
  );
}

export default function VoyagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`voyager-root ${satoshi.variable}`}>
      <TopNav />
      <main className="mx-auto max-w-[1120px] px-6 py-7">{children}</main>
    </div>
  );
}
