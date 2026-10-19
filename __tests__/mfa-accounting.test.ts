// exclusiveMfaAccounting (auth-config.mjs): per-user queue with a deadline and
// a re-entry guard. A hung critical section must fail closed and must not
// wedge the queue for that user, nor block other users.
import { describe, expect, it } from "vitest";
import { exclusiveMfaAccounting, MFA_ACCOUNTING_TIMEOUT_MS } from "@/lib/server/auth-config.mjs";

const never = () => new Promise<never>(() => {});
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("exclusiveMfaAccounting", () => {
  it("runs the default timeout at 10 s or less", () => {
    expect(MFA_ACCOUNTING_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MFA_ACCOUNTING_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("a hung critical section fails closed with 503 MFA_ACCOUNTING_TIMEOUT", async () => {
    const err = await exclusiveMfaAccounting("hung-a", never, { timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode ?? err.status).toBe(503);
    expect(err.body?.code ?? err.code).toBe("MFA_ACCOUNTING_TIMEOUT");
  });

  it("releases the lock after a timeout: the next section for the same user runs", async () => {
    await exclusiveMfaAccounting("hung-b", never, { timeoutMs: 30 }).catch(() => null);
    await expect(exclusiveMfaAccounting("hung-b", () => "next")).resolves.toBe("next");
  });

  it("a hung section for one user does not block another user", async () => {
    const hung = exclusiveMfaAccounting("hung-c", never, { timeoutMs: 5_000 }).catch(() => "timed-out");
    const other = await Promise.race([exclusiveMfaAccounting("user-d", () => "free"), tick(500).then(() => "blocked")]);
    expect(other).toBe("free");
    // clean up: the hung section times out on its own deadline
    await hung;
  }, 10_000);

  it("sections for the same user run one after another, in order", async () => {
    const log: string[] = [];
    const a = exclusiveMfaAccounting("serial-e", async () => {
      log.push("a-start");
      await tick(30);
      log.push("a-end");
    });
    const b = exclusiveMfaAccounting("serial-e", async () => {
      log.push("b-start");
      log.push("b-end");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("a failing section does not wedge the queue", async () => {
    await expect(exclusiveMfaAccounting("fail-f", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(exclusiveMfaAccounting("fail-f", () => 7)).resolves.toBe(7);
  });

  it("a nested call for the same user from inside its own section does not deadlock", async () => {
    const result = await Promise.race([
      exclusiveMfaAccounting("nest-g", () => exclusiveMfaAccounting("nest-g", () => "inner")),
      tick(1_000).then(() => "DEADLOCK"),
    ]);
    expect(result).toBe("inner");
  });

  it("the re-entry guard does not leak to unrelated sections started later", async () => {
    await exclusiveMfaAccounting("nest-h", () => exclusiveMfaAccounting("nest-h", () => 1));
    const log: string[] = [];
    const outer = exclusiveMfaAccounting("nest-h", async () => {
      log.push("outer");
      await tick(20);
    });
    const later = exclusiveMfaAccounting("nest-h", () => log.push("later"));
    await Promise.all([outer, later]);
    expect(log).toEqual(["outer", "later"]);
  });
});
