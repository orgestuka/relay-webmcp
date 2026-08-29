export interface BridgeAuthorityInput {
  remoteAvailable: boolean;
  requiresHumanApproval: boolean;
  planStatus: string | null;
}

export function bridgeCapabilityAllowed(input: BridgeAuthorityInput): boolean {
  if (!input.remoteAvailable) return false;
  if (!input.requiresHumanApproval) return true;
  return input.planStatus === "APPROVED";
}
