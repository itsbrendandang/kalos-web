"use client";

import { useState, type FormEvent } from "react";
import { Callout } from "@/components/kit/callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, data };
}

function errorText(status: number, data: Record<string, unknown> | null): string {
  const code = typeof data?.code === "string" ? data.code : "";
  if (status === 429) return "Too many attempts. Wait a little and try again.";
  if (code === "TOTP_REPLAYED") return "That code was already used. Wait for the next one.";
  if (status === 401 && code !== "INVALID_CODE" && code !== "INVALID_BACKUP_CODE") return "Your sign-in expired. Sign in again.";
  return "That code is not right. Check your authenticator app and try again.";
}

/** Full reload so the root layout re-resolves the (now MFA-verified) session. */
function go(next: string) {
  window.location.assign(next);
}

function CodeForm({ label, onSubmit, busy, backup }: { label: string; onSubmit: (code: string) => void; busy: boolean; backup?: boolean }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="grid gap-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(code.trim());
      }}
    >
      <label htmlFor={backup ? "backup-code" : "totp-code"} className="text-label text-fg">
        {label}
      </label>
      <Input
        id={backup ? "backup-code" : "totp-code"}
        name="code"
        autoComplete="one-time-code"
        inputMode={backup ? "text" : "numeric"}
        pattern={backup ? undefined : "[0-9]{6}"}
        maxLength={backup ? 32 : 6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" disabled={busy || code.trim().length === 0}>
        {busy ? "Checking…" : "Verify"}
      </Button>
    </form>
  );
}

/** Verify an existing authenticator (or a backup code) for this session. */
export function MfaVerify({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    const r = useBackup ? await post("/two-factor/verify-backup-code", { code }) : await post("/two-factor/verify-totp", { code });
    if (r.ok) return go(next);
    setError(errorText(r.status, r.data));
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      {error ? <Callout tone="bad" title={error} /> : null}
      <CodeForm
        key={useBackup ? "b" : "t"}
        backup={useBackup}
        label={useBackup ? "Backup code" : "6-digit code from your authenticator app"}
        onSubmit={verify}
        busy={busy}
      />
      <Button variant="link" onClick={() => setUseBackup((b) => !b)} className="justify-self-start">
        {useBackup ? "Use your authenticator app instead" : "Use a backup code instead"}
      </Button>
    </div>
  );
}

/** First-time TOTP enrolment: show the secret, confirm one code, then show backup codes once. */
export function MfaEnrol({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [done, setDone] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    const r = await post("/two-factor/enable", {});
    const uri = typeof r.data?.totpURI === "string" ? r.data.totpURI : null;
    if (r.ok && uri) {
      const secret = new URL(uri).searchParams.get("secret") ?? "";
      setSetup({ uri, secret, backupCodes: Array.isArray(r.data?.backupCodes) ? (r.data.backupCodes as string[]) : [] });
    } else {
      setError(r.status === 401 ? "Your sign-in expired. Sign in again." : "Could not start setup. Reload the page and try again.");
    }
    setBusy(false);
  }

  async function confirm(code: string) {
    setBusy(true);
    setError(null);
    const r = await post("/two-factor/verify-totp", { code });
    if (r.ok) setDone(true);
    else setError(errorText(r.status, r.data));
    setBusy(false);
  }

  if (done && setup) {
    return (
      <div className="grid gap-4">
        <Callout tone="good" title="Authenticator app is set up">
          Save these backup codes somewhere safe (a password manager). Each works once if you lose your phone. They are
          shown only now.
        </Callout>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-subtle p-3 font-mono text-label text-fg">
          {setup.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button onClick={() => go(next)}>I saved my backup codes</Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="grid gap-4">
        {error ? <Callout tone="bad" title={error} /> : null}
        <p className="text-body text-fg-muted">
          Kalos requires a second factor for every account. You need an authenticator app such as Google Authenticator,
          1Password, Bitwarden or Authy.
        </p>
        <Button onClick={begin} disabled={busy}>
          {busy ? "Preparing…" : "Set up authenticator app"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? <Callout tone="bad" title={error} /> : null}
      <ol className="grid list-decimal gap-2 pl-5 text-body text-fg">
        <li>
          In your authenticator app choose &ldquo;Enter a setup key&rdquo; and paste this key (time-based):
          <code className="mt-1 block rounded-md border border-border bg-subtle px-2 py-1.5 font-mono text-label break-all select-all">
            {setup.secret}
          </code>
          <a href={setup.uri} className="text-label text-accent underline underline-offset-4">
            Or open it in an authenticator app on this device
          </a>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <CodeForm label="6-digit code" onSubmit={confirm} busy={busy} />
    </div>
  );
}

/** Regenerate backup codes (needs a second-factor check in the last 5 minutes). */
export function BackupCodes() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    setError(null);
    const r = await post("/two-factor/generate-backup-codes", {});
    if (r.ok && Array.isArray(r.data?.backupCodes)) setCodes(r.data.backupCodes as string[]);
    else if (r.data?.code === "STEP_UP_REQUIRED") setStepUp(true);
    else setError("Could not create new backup codes. Try again.");
    setBusy(false);
  }

  if (stepUp) {
    return (
      <div className="grid gap-3">
        <p className="text-body text-fg-muted">Confirm it is you: enter a current code first.</p>
        <MfaVerify next="/settings/security?stepup=1" />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {error ? <Callout tone="bad" title={error} /> : null}
      {codes ? (
        <>
          <p className="text-body text-fg-muted">Your old backup codes no longer work. Save these now; they are shown only once.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-subtle p-3 font-mono text-label text-fg">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      ) : (
        <Button variant="outline" onClick={regenerate} disabled={busy} className="justify-self-start">
          {busy ? "Creating…" : "Create new backup codes"}
        </Button>
      )}
    </div>
  );
}
