"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Sparkles, FlaskConical, Database, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/optimize", label: "Optimize", icon: Sparkles },
  { href: "/analyze", label: "Analyze", icon: FlaskConical },
  { href: "/data", label: "Data", icon: Database },
];

const OBJECTIVES = [
  { key: "titer", label: "Titer", color: "#5bd39b" },
  { key: "purity", label: "Purity", color: "#6f7bd6" },
];

function Leaf({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21c0-5 0-7-3-10S4 7 4 7s4 1 6 3 2 5 2 5z" fill="#5bd39b" />
      <path d="M12 21c0-4 1-6 3.5-8.5S20 9 20 9s-1 4-3.5 6.5S12 21 12 21z" fill="#15a375" />
    </svg>
  );
}

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 shrink-0 flex-col bg-sidebar px-3 py-5 max-md:hidden">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Leaf />
          <span className="font-head text-[17px] font-bold text-white">Kalos</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = isActive(path, n.href, n.exact);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3.5 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-accent font-semibold text-white shadow-[0_6px_16px_rgba(21,163,117,.30)]"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-7 px-2">
          <div className="mb-2.5 font-mono text-[10px] tracking-wide text-white/40 uppercase">Objectives</div>
          <div className="flex flex-col gap-1.5">
            {OBJECTIVES.map((o) => (
              <div key={o.key} className="flex items-center gap-2 text-[12px] text-white/70">
                <span className="size-2 rounded-full" style={{ background: o.color }} />
                {o.label}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto px-2 font-mono text-[10px] tracking-wide text-white/45">
          powered by BoTorch + ESM-2
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 md:hidden">
          <Leaf size={20} />
          <span className="font-head font-bold">Kalos</span>
        </div>
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
