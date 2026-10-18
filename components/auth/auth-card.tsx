import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/**
 * Centered single-card frame for the pages that render outside the workbench
 * shell (sign-in, signed-out, accept-invite, MFA, org picker).
 */
export function AuthCard({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-heading text-fg">Kalos</p>
        <Card bordered className="bg-surface">
          <h1 className="text-title text-fg">{title}</h1>
          {description ? <p className="mt-1.5 text-body text-fg-muted">{description}</p> : null}
          {children ? <div className="mt-6 grid gap-4">{children}</div> : null}
        </Card>
      </div>
    </main>
  );
}
