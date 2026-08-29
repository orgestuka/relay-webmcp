import { describe, expect, it } from "vitest";
import { amendmentAllowedStatus } from "./amendment-state-guard";

describe("authority amendment state guard", () => {
  it("allows authority tightening only for a genuinely validated plan", () => {
    expect(amendmentAllowedStatus("VALIDATED")).toBe(true);
  });

  it.each([
    null,
    "DRAFT",
    "STALE",
    "AWAITING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "COMMITTED",
  ])("blocks amendment in %s", (status) => {
    expect(amendmentAllowedStatus(status)).toBe(false);
  });
});
