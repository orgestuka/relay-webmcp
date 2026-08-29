import type { ApprovalToken } from "@relay/contracts";
import { sha256 } from "@relay/pact";

export interface ApprovalEvidence {
  capturedAt: string;
  payloadDigest: string;
  token: ApprovalToken;
}

const approvals = new Map<string, ApprovalEvidence>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isApprovalToken(value: unknown): value is ApprovalToken {
  if (!isRecord(value) || value.algorithm !== "ECDSA_P256_SHA256") return false;
  if (typeof value.signature !== "string" || !isRecord(value.payload)) return false;
  const payload = value.payload;
  return typeof payload.sessionId === "string"
    && typeof payload.planId === "string"
    && typeof payload.planHash === "string"
    && Array.isArray(payload.scopes)
    && typeof payload.maximumCost === "number"
    && typeof payload.issuedAt === "string"
    && typeof payload.expiresAt === "string";
}

export async function recordApprovalEvidence(value: unknown): Promise<boolean> {
  if (!isApprovalToken(value)) return false;
  const token = structuredClone(value);
  const payloadDigest = await sha256(token.payload);
  if (!approvals.has(payloadDigest)) {
    approvals.set(payloadDigest, {
      capturedAt: new Date().toISOString(),
      payloadDigest,
      token,
    });
  }
  return true;
}

export function readApprovalEvidence(): ApprovalEvidence[] {
  return [...approvals.values()].map((evidence) => structuredClone(evidence));
}
