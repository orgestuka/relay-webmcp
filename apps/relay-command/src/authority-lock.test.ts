import { describe, expect, it } from "vitest";
import { stageLockedStatus } from "./authority-guard";

describe("Relay plan replacement lock", () => {
  it.each([
    "AWAITING_APPROVAL",
    "APPROVED",
    "COMMITTED",
  ])("locks relay_stage_plan in %s", (status) => {
    expect(stageLockedStatus(status)).toBe(true);
  });

  it.each([
    null,
    "DRAFT",
    "VALIDATED",
    "STALE",
    "REJECTED",
  ])("allows safe staging or recovery in %s", (status) => {
    expect(stageLockedStatus(status)).toBe(false);
  });
});
