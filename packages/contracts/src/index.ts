export type ProviderId = "shelter" | "transit" | "supply";

export type PlanStatus =
  | "DRAFT"
  | "VALIDATED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "STALE"
  | "REJECTED"
  | "COMMITTED";

export interface ResourceRecord {
  id: string;
  label: string;
  available: number;
  unit: string;
  unitCost: number;
  tags?: string[];
  detail?: string;
}

export interface ProviderStateSnapshot {
  providerId: ProviderId;
  providerName: string;
  origin: string;
  stateVersion: number;
  updatedAt: string;
  resources: ResourceRecord[];
}

export interface ProviderProposal {
  proposalId: string;
  providerId: ProviderId;
  providerOrigin: string;
  resourceId: string;
  resourceLabel: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  purpose: string;
  stateVersion: number;
  createdAt: string;
  expiresAt: string;
}

export interface ProposalScope {
  proposalId: string;
  providerId: ProviderId;
  providerOrigin: string;
  resourceId: string;
  resourceLabel: string;
  quantity: number;
  unit: string;
  unitCost: number;
  purpose: string;
  stateVersion: number;
  expiresAt: string;
  maxCost: number;
}

export interface PlanDraft {
  planId: string;
  incidentId: string;
  summary: string;
  rationale: string;
  proposals: ProviderProposal[];
  totalCost: number;
  maxBudget: number;
  revision: number;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalPayload {
  sessionId: string;
  planId: string;
  planHash: string;
  scopes: ProposalScope[];
  maximumCost: number;
  issuedAt: string;
  expiresAt: string;
}

export interface ApprovalToken {
  payload: ApprovalPayload;
  signature: string;
  algorithm: "ECDSA_P256_SHA256";
}

export interface CommitReceipt {
  receiptId: string;
  proposalId: string;
  providerId: ProviderId;
  providerOrigin: string;
  committedAt: string;
  resultingStateVersion: number;
  amount: number;
  totalCost: number;
}

export interface RelaySessionInitMessage {
  type: "relay_session_init";
  sessionId: string;
  publicKeyJwk: JsonWebKey;
  commandOrigin: string;
}

export interface ProviderDisruptionMessage {
  type: "relay_demo_inject_disruption";
  providerId: ProviderId;
  resourceId: string;
  newAvailability: number;
}

export const PROVIDER_RPC_PROTOCOL = "relay.provider-rpc.v1" as const;

export interface ProviderRpcProbeMessage {
  type: "relay_provider_rpc_probe";
  protocol: typeof PROVIDER_RPC_PROTOCOL;
  providerId: ProviderId;
}

export interface ProviderRpcRequestMessage {
  type: "relay_provider_rpc_request";
  protocol: typeof PROVIDER_RPC_PROTOCOL;
  requestId: string;
  providerId: ProviderId;
  toolName: string;
  input: unknown;
}

export interface ProviderRpcCapabilitiesMessage {
  type: "relay_provider_rpc_capabilities";
  protocol: typeof PROVIDER_RPC_PROTOCOL;
  providerId: ProviderId;
  tools: string[];
}

export interface ProviderRpcResponseMessage {
  type: "relay_provider_rpc_response";
  protocol: typeof PROVIDER_RPC_PROTOCOL;
  requestId: string;
  providerId: ProviderId;
  toolName: string;
  transportOk: boolean;
  output?: string;
  error?: {
    code: string;
    message: string;
  };
}

export type RelayToProviderRpcMessage =
  | ProviderRpcProbeMessage
  | ProviderRpcRequestMessage;

export interface ProviderReadyMessage {
  type: "relay_provider_ready";
  providerId: ProviderId;
}

export interface ProviderStateMessage {
  type: "relay_provider_state";
  snapshot: ProviderStateSnapshot;
}

export interface ProviderProposalMessage {
  type: "relay_provider_proposal";
  proposal: ProviderProposal;
}

export interface ProviderReceiptMessage {
  type: "relay_provider_receipt";
  receipt: CommitReceipt;
}

export type ProviderToRelayMessage =
  | ProviderReadyMessage
  | ProviderStateMessage
  | ProviderProposalMessage
  | ProviderReceiptMessage
  | ProviderRpcCapabilitiesMessage
  | ProviderRpcResponseMessage;
