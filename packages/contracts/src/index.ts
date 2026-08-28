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
  stateVersion: number;
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
  | ProviderReceiptMessage;
