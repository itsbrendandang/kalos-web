import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./voyager.css";

// TODO: self-host Satoshi. The prototype's typeface (Satoshi) is not on Google
// Fonts and no Satoshi font files are checked into this repo, so it cannot be
// self-hosted via next/font/local without first sourcing licensed font files.
// Manrope is used as the closest self-hostable stand-in; once real Satoshi
// font files are added under e.g. public/fonts/satoshi/, swap this for
// next/font/local and keep the exported `--font-voyager` variable name so no
// other file needs to change.
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-voyager" });

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
    <div className={`voyager-root ${manrope.variable}`}>
      <TopNav />
      <main className="mx-auto max-w-[1120px] px-6 py-7">{children}</main>
    </div>
  );
}
