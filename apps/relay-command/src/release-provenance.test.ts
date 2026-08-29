import { describe, expect, it } from "vitest";
import {
  assertCompiledReleaseSha,
  consistentHeaderValue,
  normalizeReleaseSha,
  validReleaseSha,
} from "./release-provenance";

const sha = "1234567890abcdef1234567890abcdef12345678";

describe("compiled release provenance", () => {
  it("normalizes and accepts an exact non-zero commit SHA", () => {
    expect(normalizeReleaseSha(`  ${sha.toUpperCase()}  `)).toBe(sha);
    expect(validReleaseSha(sha)).toBe(true);
    expect(assertCompiledReleaseSha(sha, { localDevelopment: false })).toBe(sha);
  });

  it("accepts duplicate identical edge headers but rejects conflicting values", () => {
    expect(consistentHeaderValue(`${sha}, ${sha.toUpperCase()}`)).toBe(sha);
    expect(consistentHeaderValue(`${sha}, ${"a".repeat(40)}`)).toBeNull();
    expect(consistentHeaderValue(null)).toBeNull();
  });

  it("allows an omitted SHA only for local development", () => {
    expect(assertCompiledReleaseSha(undefined, { localDevelopment: true })).toBeNull();
    expect(() => assertCompiledReleaseSha(undefined, { localDevelopment: false }))
      .toThrow(/Production Relay requires VITE_RELEASE_SHA/);
  });

  it("rejects placeholders, malformed values and partial hashes", () => {
    for (const value of [
      "0".repeat(40),
      "development",
      "abc123",
      `${sha}00`,
      "g".repeat(40),
    ]) {
      expect(validReleaseSha(value)).toBe(false);
      expect(() => assertCompiledReleaseSha(value, { localDevelopment: false })).toThrow();
      expect(() => assertCompiledReleaseSha(value, { localDevelopment: true })).toThrow();
    }
  });
});
