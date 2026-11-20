import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_UPLOAD_MB,
  MULTIPART_HEADROOM_BYTES,
  uploadLimitBytes,
  proxyBodyCapBytes,
} from "@/lib/upload-limits";

describe("uploadLimitBytes", () => {
  it("defaults to 25 MB when input is undefined", () => {
    expect(uploadLimitBytes(undefined)).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is null", () => {
    expect(uploadLimitBytes(null)).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is empty string", () => {
    expect(uploadLimitBytes("")).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is whitespace", () => {
    expect(uploadLimitBytes("   ")).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is non-numeric", () => {
    expect(uploadLimitBytes("invalid")).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is zero", () => {
    expect(uploadLimitBytes("0")).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("defaults to 25 MB when input is negative", () => {
    expect(uploadLimitBytes("-5")).toBe(
      Math.floor(DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
    );
  });

  it("returns the correct byte count for a valid number", () => {
    expect(uploadLimitBytes("25")).toBe(
      Math.floor(25 * 1024 * 1024)
    );
  });

  it("correctly floors a fractional MB value", () => {
    expect(uploadLimitBytes("30.5")).toBe(
      Math.floor(30.5 * 1024 * 1024)
    );
  });

  it("uses Math.floor for the conversion", () => {
    const result = uploadLimitBytes("1");
    expect(result).toBe(Math.floor(1 * 1024 * 1024));
  });
});

describe("proxyBodyCapBytes", () => {
  it("equals uploadLimitBytes + MULTIPART_HEADROOM_BYTES for undefined", () => {
    const expected = uploadLimitBytes(undefined) + MULTIPART_HEADROOM_BYTES;
    expect(proxyBodyCapBytes(undefined)).toBe(expected);
  });

  it("equals uploadLimitBytes + MULTIPART_HEADROOM_BYTES for a valid value", () => {
    const expected = uploadLimitBytes("50") + MULTIPART_HEADROOM_BYTES;
    expect(proxyBodyCapBytes("50")).toBe(expected);
  });

  it("equals uploadLimitBytes + MULTIPART_HEADROOM_BYTES for null", () => {
    const expected = uploadLimitBytes(null) + MULTIPART_HEADROOM_BYTES;
    expect(proxyBodyCapBytes(null)).toBe(expected);
  });

  it("is larger than uploadLimitBytes due to headroom", () => {
    expect(proxyBodyCapBytes("25")).toBeGreaterThan(uploadLimitBytes("25"));
  });
});
