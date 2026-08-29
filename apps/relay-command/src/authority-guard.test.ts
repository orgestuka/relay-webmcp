import { describe, expect, it } from "vitest";
import { HumanAuthorityCeiling } from "./authority-guard";

describe("HumanAuthorityCeiling", () => {
  it("starts at the incident ceiling and caps excessive agent requests", () => {
    const authority = new HumanAuthorityCeiling(5000);

    expect(authority.maximum).toBe(5000);
    expect(authority.capStageInput({ summary: "plan", maxBudget: 9000 }))
      .toEqual({ summary: "plan", maxBudget: 5000 });
    expect(authority.capStageInput({ summary: "plan" }))
      .toEqual({ summary: "plan", maxBudget: 5000 });
  });

  it("preserves a human-tightened ceiling across stale restaging", () => {
    const authority = new HumanAuthorityCeiling(5000);

    expect(authority.confirmTightening(3000)).toBe(true);
    expect(authority.maximum).toBe(3000);

    // A recovering agent may ask for the old incident maximum, but the last
    // human-confirmed ceiling remains authoritative.
    expect(authority.capStageInput({ maxBudget: 5000 })).toEqual({ maxBudget: 3000 });
    expect(authority.capStageInput({ maxBudget: 2793 })).toEqual({ maxBudget: 2793 });
  });

  it("never allows authority to increase after the human tightens it", () => {
    const authority = new HumanAuthorityCeiling(5000);

    expect(authority.confirmTightening(3000)).toBe(true);
    expect(authority.confirmTightening(4000)).toBe(false);
    expect(authority.maximum).toBe(3000);

    expect(authority.confirmTightening(2800)).toBe(true);
    expect(authority.maximum).toBe(2800);
  });

  it("rejects invalid ceilings", () => {
    expect(() => new HumanAuthorityCeiling(0)).toThrow(/positive and finite/);

    const authority = new HumanAuthorityCeiling(5000);
    expect(authority.confirmTightening(Number.NaN)).toBe(false);
    expect(authority.confirmTightening(-1)).toBe(false);
    expect(authority.maximum).toBe(5000);
  });
});
