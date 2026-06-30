"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, FlaskConical, Database, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/optimize", label: "Optimize", icon: Sparkles },
  { href: "/analyze", label: "Analyze", icon: FlaskConical },
  { href: "/data", label: "Data", icon: Database },
];

function Leaf({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21c0-5 0-7-3-10S4 7 4 7s4 1 6 3 2 5 2 5z" fill="#5bd39b" />
      <path d="M12 21c0-4 1-6 3.5-8.5S20 9 20 9s-1 4-3.5 6.5S12 21 12 21z" fill="#15a375" />
    </svg>
  );
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
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] transition-colors",
                  active ? "bg-accent font-semibold text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 font-mono text-[10px] tracking-wide text-white/45">
          powered by BoTorch + ESM-2
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 md:hidden">
          <Leaf size={20} />
          <span className="font-head font-bold">Kalos</span>
        </div>
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
