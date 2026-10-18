"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Starts Google OAuth through Better Auth. Sends only provider + callback
 * URLs (the server rejects any `scopes`/`idToken` in the body); Better Auth
 * checks callbackURL against BETTER_AUTH_URL, so it cannot point off-site.
 */
export function GoogleSignInButton({ callbackURL = "/", label = "Continue with Google" }: { callbackURL?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL: "/sign-in" }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url && data.url.startsWith("https://accounts.google.com/")) {
        window.location.assign(data.url);
        return;
      }
      setError(res.status === 429 ? "Too many attempts. Wait a minute and try again." : "Could not start Google sign-in. Try again.");
    } catch {
      setError("Could not reach Kalos. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-2">
      <Button size="lg" onClick={start} disabled={busy} className="w-full">
        {busy ? "Opening Google…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-label text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
