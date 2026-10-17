import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReadoutTargetError,
  buildReadoutTarget,
  hasPhysicsColumns,
  parseCsvHeader,
  runScaleReadout,
  type ReadoutTarget,
} from "@/lib/scale-readout";

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

  it("maps 200 text/html to kind: html", async () => {
    stubFetch(new Response("<html>Prediction issued</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "html", html: "<html>Prediction issued</html>" });
  });

  it("sends the proxy's CSRF marker with the upload", async () => {
    const fetchMock = stubFetch(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    await runScaleReadout(file, target);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-kalos-csrf": "1" });
  });

  it("maps 422 to kind: gate with failedCheck and detail", async () => {
    stubFetch(
      new Response(JSON.stringify({ failed_check: "target_scale_too_large", detail: "target exceeds 20x" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "gate", failedCheck: "target_scale_too_large", detail: "target exceeds 20x" });
  });

  it("maps 503 with Retry-After to kind: busy", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "busy" }), {
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

  it("maps 401 to kind: auth", async () => {
    stubFetch(new Response(null, { status: 401 }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "auth" });
  });

  it("maps 403 to kind: auth", async () => {
    stubFetch(new Response(null, { status: 403 }));
    const result = await runScaleReadout(file, target);
    expect(result).toEqual({ kind: "auth" });
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
});
