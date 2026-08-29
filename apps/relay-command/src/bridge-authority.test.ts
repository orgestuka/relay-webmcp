import { describe, expect, it } from "vitest";
import { bridgeCapabilityAllowed } from "./bridge-authority";

describe("fixed bridge human-authority gate", () => {
  it("exposes read and proposal capabilities whenever the exact remote tool exists", () => {
    for (const planStatus of [null, "DRAFT", "VALIDATED", "AWAITING_APPROVAL", "APPROVED", "STALE", "REJECTED", "COMMITTED"]) {
      expect(bridgeCapabilityAllowed({ remoteAvailable: true, requiresHumanApproval: false, planStatus })).toBe(true);
    }
  });

  it("never exposes a wrapper when the exact remote capability is absent", () => {
    expect(bridgeCapabilityAllowed({ remoteAvailable: false, requiresHumanApproval: false, planStatus: "DRAFT" })).toBe(false);
    expect(bridgeCapabilityAllowed({ remoteAvailable: false, requiresHumanApproval: true, planStatus: "APPROVED" })).toBe(false);
  });

  it("exposes commit wrappers only after exact human approval", () => {
    for (const planStatus of [null, "DRAFT", "VALIDATED", "AWAITING_APPROVAL", "STALE", "REJECTED", "COMMITTED"]) {
      expect(bridgeCapabilityAllowed({ remoteAvailable: true, requiresHumanApproval: true, planStatus })).toBe(false);
    }
    expect(bridgeCapabilityAllowed({ remoteAvailable: true, requiresHumanApproval: true, planStatus: "APPROVED" })).toBe(true);
  });
});
