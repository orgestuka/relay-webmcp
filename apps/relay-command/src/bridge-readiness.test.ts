import { describe, expect, it } from "vitest";
import {
  expectedInitialBridgeTools,
  missingInitialBridgeTools,
} from "./bridge-readiness";

describe("initial fixed bridge readiness", () => {
  it("passes only when every permanent non-consequential wrapper is registered", () => {
    expect(missingInitialBridgeTools(expectedInitialBridgeTools)).toEqual([]);
  });

  it("names every missing wrapper without accepting unrelated tools", () => {
    const registered = [
      "relay_bridge_status",
      "relay_bridge_shelter_find_capacity",
      "relay_bridge_shelter_propose_reservation",
      "relay_bridge_transit_find_accessible_routes",
      "relay_bridge_transit_propose_reservation",
      "relay_bridge_supply_check_stock",
      "unrelated_tool",
    ];

    expect(missingInitialBridgeTools(registered)).toEqual([
      "relay_bridge_supply_propose_reservation",
    ]);
  });
});
