import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READOUT_PATH,
  ReadoutTargetError,
  buildReadoutTarget,
  gateRefusal,
  hasPhysicsColumns,
  isScaleReadout,
  parseCsvHeader,
  readReasons,
  runScaleReadout,
  type ReadoutTarget,
} from "@/lib/scale-readout";
import readoutFixture from "./fixtures/scale-v2-readout.json";
import refusedFixture from "./fixtures/scale-v2-readout-refused.json";

describe("parseCsvHeader", () => {
  it("splits a plain comma-delimited header", () => {
    expect(parseCsvHeader("scale_L,titer_g_per_L,ph_setpoint\n1,2,3")).toEqual([
      "scale_L",
      "titer_g_per_L",
      "ph_setpoint",
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsvHeader("﻿scale_L,titer_g_per_L\n1,2")).toEqual(["scale_L", "titer_g_per_L"]);
  });

  it("handles CRLF line endings, reading only the header row", () => {
    expect(parseCsvHeader("scale_L,titer_g_per_L\r\n1,2\r\n3,4")).toEqual(["scale_L", "titer_g_per_L"]);
  });

  it("handles a header with no trailing newline at all", () => {
    expect(parseCsvHeader("scale_L,titer_g_per_L")).toEqual(["scale_L", "titer_g_per_L"]);
  });

  it("handles quoted headers containing a comma", () => {
    expect(parseCsvHeader('"titer, g/L",scale_L\n1,2')).toEqual(["titer, g/L", "scale_L"]);
  });

  it("handles a quoted header with an escaped double-quote", () => {
    expect(parseCsvHeader('"weird ""name""",scale_L\n1,2')).toEqual(['weird "name"', "scale_L"]);
  });

  it("trims incidental whitespace around header cells", () => {
    expect(parseCsvHeader(" scale_L , titer_g_per_L \n1,2")).toEqual(["scale_L", "titer_g_per_L"]);
  });
});

describe("hasPhysicsColumns", () => {
  it("is true only when both agitation_rpm and airflow_L_per_min are present", () => {
    expect(hasPhysicsColumns(["scale_L", "agitation_rpm", "airflow_L_per_min", "titer"])).toBe(true);
  });

  it("is false when only one of the two columns is present", () => {
    expect(hasPhysicsColumns(["scale_L", "agitation_rpm", "titer"])).toBe(false);
    expect(hasPhysicsColumns(["scale_L", "airflow_L_per_min", "titer"])).toBe(false);
  });

  it("is false when neither column is present", () => {
    expect(hasPhysicsColumns(["scale_L", "titer", "ph_setpoint"])).toBe(false);
  });
});

const scaleOnlyHeader = ["scale_L", "titer_g_per_L", "ph_setpoint", "temperature_C"];
const physicsHeader = [...scaleOnlyHeader, "agitation_rpm", "airflow_L_per_min"];

describe("buildReadoutTarget", () => {
  it("omits agitation/airflow for a scale-only sheet", () => {
    const target = buildReadoutTarget({
      header: scaleOnlyHeader,
      targetColumn: "titer_g_per_L",
      scaleL: 7500,
      processParams: { ph_setpoint: 7.2, temperature_C: 37 },
    });
    expect(target).toEqual({
      scale_L: 7500,
      target_column: "titer_g_per_L",
      process_params: { ph_setpoint: 7.2, temperature_C: 37 },
    });
    expect(target).not.toHaveProperty("agitation_rpm");
    expect(target).not.toHaveProperty("airflow_L_per_min");
  });

  it("includes agitation/airflow for a physics sheet when both are supplied", () => {
    const target = buildReadoutTarget({
      header: physicsHeader,
      targetColumn: "titer_g_per_L",
      scaleL: 7500,
      processParams: { ph_setpoint: 7.2, temperature_C: 37 },
      agitationRpm: 150,
      airflowLPerMin: 300,
    });
    expect(target.agitation_rpm).toBe(150);
    expect(target.airflow_L_per_min).toBe(300);
  });

  it("throws a ReadoutTargetError when a physics sheet is missing agitation", () => {
    expect(() =>
      buildReadoutTarget({
        header: physicsHeader,
        targetColumn: "titer_g_per_L",
        scaleL: 7500,
        processParams: { ph_setpoint: 7.2 },
        airflowLPerMin: 300,
      }),
    ).toThrow(ReadoutTargetError);
  });

  it("throws when a physics sheet is missing airflow", () => {
    expect(() =>
      buildReadoutTarget({
        header: physicsHeader,
        targetColumn: "titer_g_per_L",
        scaleL: 7500,
        processParams: { ph_setpoint: 7.2 },
        agitationRpm: 150,
      }),
    ).toThrow(ReadoutTargetError);
  });

  it("throws when scale_L is not a positive finite number", () => {
    expect(() =>
      buildReadoutTarget({
        header: scaleOnlyHeader,
        targetColumn: "titer_g_per_L",
        scaleL: 0,
        processParams: { ph_setpoint: 7.2 },
      }),
    ).toThrow(ReadoutTargetError);
    expect(() =>
      buildReadoutTarget({
        header: scaleOnlyHeader,
        targetColumn: "titer_g_per_L",
        scaleL: Number.NaN,
        processParams: { ph_setpoint: 7.2 },
      }),
    ).toThrow(ReadoutTargetError);
  });

  it("throws when no process columns are given", () => {
    expect(() =>
      buildReadoutTarget({
        header: scaleOnlyHeader,
        targetColumn: "titer_g_per_L",
        scaleL: 7500,
        processParams: {},
      }),
    ).toThrow(ReadoutTargetError);
  });

  it("throws when a process column value is not finite", () => {
    expect(() =>
      buildReadoutTarget({
        header: scaleOnlyHeader,
        targetColumn: "titer_g_per_L",
        scaleL: 7500,
        processParams: { ph_setpoint: Number.NaN },
      }),
    ).toThrow(ReadoutTargetError);
  });

  it("throws when no target column is chosen", () => {
    expect(() =>
      buildReadoutTarget({
        header: scaleOnlyHeader,
        targetColumn: "",
        scaleL: 7500,
        processParams: { ph_setpoint: 7.2 },
      }),
    ).toThrow(ReadoutTargetError);
  });
});

describe("runScaleReadout", () => {
  const target: ReadoutTarget = {
    scale_L: 7500,
    target_column: "titer_g_per_L",
    process_params: { ph_setpoint: 7.2 },
  };
  const file = new File(["scale_L,titer_g_per_L\n1,2"], "sheet.csv", { type: "text/csv" });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("posts the sheet and target JSON to the JSON readout route through the proxy", async () => {
    const fetchMock = stubFetch(json(readoutFixture));
    await runScaleReadout(file, target);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(READOUT_PATH).toBe("/api/scale/readout.json");
    expect(url).toBe("/api/engine/api/scale/readout.json");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-kalos-csrf": "1", Accept: "application/json" });
    const body = init.body as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(JSON.parse(String(body.get("target")))).toEqual(target);
  });

  it("maps a 200 NUMBER readout (captured from the live engine) to kind: readout", async () => {
    stubFetch(json(readoutFixture));
    const result = await runScaleReadout(file, target);
    expect(result.kind).toBe("readout");
    if (result.kind !== "readout") return;
    expect(result.readout.decision).toBe("NUMBER");
    expect(result.readout.interval_coverage).toBe(0.9);
    expect(result.readout.readout_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a REFUSAL is a 200 readout, not an error, with reasons and a data plan", async () => {
    stubFetch(json(refusedFixture));
    const result = await runScaleReadout(file, target);
    expect(result.kind).toBe("readout");
    if (result.kind !== "readout") return;
    expect(result.readout.decision).toBe("REFUSAL");
    expect(result.readout.prediction).toBeNull();
    expect(result.readout.interval).toBeNull();
    expect(result.readout.reasons.length).toBeGreaterThan(0);
    expect(result.readout.data_plan.length).toBeGreaterThan(0);
  });

  it("a 200 that is not a readout (HTML, or another shape) is never charted", async () => {
    stubFetch(new Response("<html>Prediction issued</html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await runScaleReadout(file, target)).kind).toBe("unavailable");
    stubFetch(json({ kind: "something_else" }));
    expect((await runScaleReadout(file, target)).kind).toBe("unavailable");
    expect(isScaleReadout(readoutFixture)).toBe(true);
    expect(isScaleReadout({ ...readoutFixture, decision: "MAYBE" })).toBe(false);
  });

  it("maps 422 to kind: gate with failedCheck and detail (the live engine's 2000 L answer)", async () => {
    stubFetch(
      json(
        {
          error: "interpolation is out of scope for this readout",
          code: "target_not_interpolation",
          failed_check: "target_not_interpolation",
          detail: "interpolation is out of scope for this readout",
        },
        422,
      ),
    );
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "gate", failedCheck: "target_not_interpolation", detail: "interpolation is out of scope for this readout" });
  });

  it("a 422 without failed_check falls back to the code (invalid_target)", async () => {
    stubFetch(json({ error: "bad target", code: "invalid_target" }, 422));
    expect(await runScaleReadout(file, target)).toEqual({ kind: "gate", failedCheck: "invalid_target", detail: "bad target" });
  });

  it("maps 503 with Retry-After to kind: busy", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "another analysis is running", code: "engine_busy" }), {
        status: 503,
        headers: { "content-type": "application/json", "retry-after": "12" },
      }),
    );
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "busy", retryAfterSeconds: 12 });
  });

  it("maps 503 with no Retry-After to kind: busy with null retryAfterSeconds", async () => {
    stubFetch(new Response(JSON.stringify({ error: "busy" }), { status: 503, headers: { "content-type": "application/json" } }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "busy", retryAfterSeconds: null });
  });

  it("maps a proxy 503 that is not engine_busy to kind: unavailable, not busy", async () => {
    stubFetch(new Response(JSON.stringify({ error: "engine_credentials_unavailable" }), { status: 503, headers: { "content-type": "application/json" } }));
    const result = await runScaleReadout(file, target);
    expect(result.kind).toBe("unavailable");
  });

  it("maps 401 to kind: auth that asks the user to sign in again", async () => {
    stubFetch(new Response(null, { status: 401 }));
    const result = await runScaleReadout(file, target);
    expect(result).toMatchObject({ kind: "auth", signIn: true });
  });

  it("maps 403 to kind: auth with plain copy for the proxy's code, never the raw code", async () => {
    stubFetch(new Response(JSON.stringify({ error: "insufficient_scope" }), { status: 403, headers: { "content-type": "application/json" } }));
    const result = await runScaleReadout(file, target);
    expect(result).toMatchObject({ kind: "auth", signIn: false });
    expect(result.kind === "auth" && result.message).toMatch(/write access/);
    expect(result.kind === "auth" && result.message).not.toMatch(/insufficient_scope/);
  });

  it("maps 413 to kind: upload with the size-limit copy", async () => {
    stubFetch(new Response(JSON.stringify({ error: "payload_too_large", limit_mb: 25 }), { status: 413, headers: { "content-type": "application/json" } }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "upload", message: expect.stringContaining("25 MB") });
  });

  it("maps 400 to kind: upload with the engine's message", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "could not parse the uploaded file" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "upload", message: "could not parse the uploaded file" });
  });

  it("maps a network failure to kind: unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runScaleReadout(file, target);
    expect(result.kind).toBe("unavailable");
  });

  it("maps an unexpected 5xx to kind: unavailable", async () => {
    stubFetch(new Response(null, { status: 502 }));
    const result = await runScaleReadout(file, target);
    expect(result.kind).toBe("unavailable");
  });

  it("maps the proxy's 504 to the timeout copy", async () => {
    stubFetch(new Response(JSON.stringify({ error: "engine_timeout" }), { status: 504, headers: { "content-type": "application/json" } }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "unavailable", message: expect.stringMatching(/took too long/) });
  });
});

describe("readReasons (the engine's sentences in plain words)", () => {
  it("rewrites known sentences, keeps unknown ones verbatim, in order", () => {
    const r = readReasons("pooled ladder MAE does not beat both naive baselines; target ratio 12.00x exceeds 5x the reference step ratio 2.00x; a brand new rule");
    expect(r.map((x) => x.raw)).toEqual([
      "pooled ladder MAE does not beat both naive baselines",
      "target ratio 12.00x exceeds 5x the reference step ratio 2.00x",
      "a brand new rule",
    ]);
    expect(r[1].plain).toMatch(/12.00x/);
    expect(r[1].plain).toMatch(/2.00x/);
    expect(r[2].plain).toBe("a brand new rule");
  });

  it("reads the live refusal reason with the engine's own numbers", () => {
    const [r] = readReasons(refusedFixture.reasons[0]);
    expect(r.raw).toBe("target ratio 18.00x exceeds 5x the reference step ratio 3.33x");
    expect(r.plain).toMatch(/18.00x/);
    expect(r.plain).toMatch(/3.33x/);
  });
});

describe("gateRefusal (a 422 in plain words)", () => {
  it("names the missing column", () => {
    expect(gateRefusal("required_columns", "missing required column(s): ['scale_L']").statement).toMatch(/scale_L/);
  });
  it("quotes the engine's counts for too few scales", () => {
    const g = gateRefusal("min_distinct_scales", "only 2 distinct scale(s) present; need 1 more (at least 3 distinct scales total)");
    expect(g.statement).toMatch(/2 distinct scales/);
    expect(g.statement).toMatch(/at least 3/);
    expect(g.fix[0]).toMatch(/1 more distinct scale\./);
  });
  it("never states a limit the engine did not send", () => {
    const g = gateRefusal("target_ratio_hard_cap", "target scale-up ratio 25.00x exceeds the 20x hard cap");
    expect(g.statement).toMatch(/25.00x/);
    expect(gateRefusal("target_ratio_hard_cap", "").statement).not.toMatch(/\d/);
  });
  it("explains the interpolation refusal (target below the largest scale run)", () => {
    const g = gateRefusal("target_not_interpolation", "interpolation is out of scope for this readout");
    expect(g.statement).toMatch(/not larger than every scale/);
    expect(g.fix.length).toBeGreaterThan(0);
  });
  it("every known check and an unknown one give a statement and a fix", () => {
    for (const check of ["required_columns", "min_distinct_scales", "non_finite_dropped_fraction", "target_not_interpolation", "target_ratio_hard_cap", "invalid_target", "brand_new"]) {
      const g = gateRefusal(check, "");
      expect(g.statement.length).toBeGreaterThan(0);
      expect(g.fix.length).toBeGreaterThan(0);
    }
  });
});
