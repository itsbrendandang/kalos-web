import type { Metadata } from "next";
import localFont from "next/font/local";
import "./projects.css";
import { ProjectsStoreProvider } from "@/components/projects/store-context";

// Satoshi is the prototype's typeface, now self-hosted via next/font/local from
// the Fontshare Font License files under app/fonts/. Exported as --font-projects,
// the variable projects.css reads.
const satoshi = localFont({
  src: "../fonts/Satoshi-Variable.woff2",
  variable: "--font-projects",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Projects",
  description: "Closed-loop bioprocess optimization — customer projects",
};

// The Projects surface renders inside the shared AppShell sidebar (see components/app-shell.tsx)
// instead of carrying its own top bar - this wrapper only keeps the projects-root
// token scope and the Satoshi font variable that the ported component styles expect.
//
// ProjectsStoreProvider is mounted here (not per-page) so the client-side
// customers/projects store survives navigation between the index and the
// per-project workspace routes - see components/projects/store-context.tsx.
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`projects-root ${satoshi.variable}`}>
      <div className="mx-auto max-w-[1120px] px-6 py-7">
        <ProjectsStoreProvider>{children}</ProjectsStoreProvider>
      </div>
    </div>
  );
}
