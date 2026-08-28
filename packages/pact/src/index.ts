import type {
  ApprovalPayload,
  ApprovalToken,
  PlanDraft,
  ProposalScope,
  ProviderProposal,
} from "@relay/contracts";

const encoder = new TextEncoder();

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function base64Url(bytes: ArrayBuffer): string {
  const raw = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalize(value)));
  return base64Url(digest);
}

export function proposalScope(proposal: ProviderProposal): ProposalScope {
  return {
    proposalId: proposal.proposalId,
    providerId: proposal.providerId,
    providerOrigin: proposal.providerOrigin,
    stateVersion: proposal.stateVersion,
    maxCost: proposal.totalCost,
  };
}

export async function hashPlan(plan: Pick<PlanDraft, "planId" | "incidentId" | "maxBudget" | "proposals">): Promise<string> {
  return sha256({
    planId: plan.planId,
    incidentId: plan.incidentId,
    maximumCost: plan.maxBudget,
    scopes: plan.proposals.map(proposalScope).sort((a, b) => a.proposalId.localeCompare(b.proposalId)),
  });
}

export interface SessionSigner {
  sessionId: string;
  publicKeyJwk: JsonWebKey;
  sign: (payload: ApprovalPayload) => Promise<ApprovalToken>;
}

export async function createSessionSigner(sessionId = crypto.randomUUID()): Promise<SessionSigner> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

  return {
    sessionId,
    publicKeyJwk,
    async sign(payload) {
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        encoder.encode(canonicalize(payload)),
      );
      return { payload, signature: base64Url(signature), algorithm: "ECDSA_P256_SHA256" };
    },
  };
}

export async function verifyApprovalToken(token: ApprovalToken, publicKeyJwk: JsonWebKey): Promise<boolean> {
  if (token.algorithm !== "ECDSA_P256_SHA256") return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    fromBase64Url(token.signature),
    encoder.encode(canonicalize(token.payload)),
  );
}

export function isExpired(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) <= now;
}

export function validateApprovalForProposal(
  token: ApprovalToken,
  proposal: ProviderProposal,
  expectedSessionId: string,
): { ok: true } | { ok: false; code: string; message: string } {
  if (token.payload.sessionId !== expectedSessionId) {
    return { ok: false, code: "SESSION_MISMATCH", message: "Approval belongs to another Relay session." };
  }
  if (isExpired(token.payload.expiresAt)) {
    return { ok: false, code: "APPROVAL_EXPIRED", message: "Human approval has expired." };
  }
  const scope = token.payload.scopes.find((candidate) => candidate.proposalId === proposal.proposalId);
  if (!scope) return { ok: false, code: "OUT_OF_SCOPE", message: "Proposal is not covered by human approval." };
  if (scope.providerId !== proposal.providerId || scope.providerOrigin !== proposal.providerOrigin) {
    return { ok: false, code: "ORIGIN_SCOPE_MISMATCH", message: "Provider identity does not match approval scope." };
  }
  if (scope.stateVersion !== proposal.stateVersion) {
    return { ok: false, code: "VERSION_SCOPE_MISMATCH", message: "Approved provider version differs from proposal." };
  }
  if (proposal.totalCost > scope.maxCost || proposal.totalCost > token.payload.maximumCost) {
    return { ok: false, code: "COST_SCOPE_EXCEEDED", message: "Proposal exceeds the human-approved cost ceiling." };
  }
  return { ok: true };
}
