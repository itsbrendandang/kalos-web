import { afterEach, describe, expect, it, vi } from "vitest";
import { submitUploadJob, type ColumnRolesInput } from "@/lib/api";

const CMP = "cmp_0123456789abcdef0123456789abcdef";
/** The app uploads through the campaign jobs route; same argument order as the old runFile. */
const runFile = (f: File, target?: string, roles?: ColumnRolesInput, sheet?: string, opts: { replace?: boolean } = {}) =>
  submitUploadJob(CMP, f, { target, roles, sheet, replace: opts.replace });


describe("upload sends explicit column roles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("appends target and a JSON roles field when given, and omits roles otherwise", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ job: { id: "job_1" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["a,b\n1,2"], "s.csv");

    await runFile(file, "y", { target: "y", features: ["a", "b"] });
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get("target")).toBe("y");
    expect(JSON.parse(body.get("roles") as string)).toEqual({ target: "y", features: ["a", "b"] });

    await runFile(file, "y");
    expect(((fetchMock.mock.calls[1][1] as RequestInit).body as FormData).has("roles")).toBe(false);
  });
});
