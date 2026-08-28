import type {
  ApprovalPayload,
  ApprovalToken,
  PlanDraft,
  ProposalScope,
  ProviderId,
  ProviderProposal,
} from "@relay/contracts";

const encoder = new TextEncoder();
const MAX_APPROVAL_LIFETIME_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 30_000;
const MAX_SCOPES = 100;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type ValidationResult = { ok: true } | { ok: false; code: string; message: string };

function fail(code: string, message: string): ValidationResult {
  return { ok: false, code, message };
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalize(value: unknown, seen = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("PACT canonical data cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError(`PACT canonical data cannot contain ${typeof value}.`);
  if (seen.has(value)) throw new TypeError("PACT canonical data cannot contain cycles.");

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new TypeError("PACT canonical arrays cannot contain sparse entries.");
      }
      return `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    }
    if (!isPlainObject(value)) throw new TypeError("PACT canonical data must use plain objects.");
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

function base64Url(bytes: ArrayBuffer): string {
  const raw = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(value)) throw new TypeError("Invalid base64url data.");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function cents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}

function sameMoney(left: number, right: number): boolean {
  const leftCents = cents(left);
  const rightCents = cents(right);
  return leftCents !== null && rightCents !== null && leftCents === rightCents;
}

function validText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function validProviderId(value: unknown): value is ProviderId {
  return value === "shelter" || value === "transit" || value === "supply";
}

function validOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && local));
  } catch {
    return false;
  }
}

export function isP256PublicJwk(value: unknown): value is JsonWebKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const jwk = value as JsonWebKey;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string") return false;
  if (typeof jwk.d === "string") return false;
  if (!BASE64URL.test(jwk.x) || !BASE64URL.test(jwk.y)) return false;
  if (jwk.key_ops && (!jwk.key_ops.includes("verify") || jwk.key_ops.includes("sign"))) return false;
  if (jwk.use && jwk.use !== "sig") return false;
  if (jwk.ext === false) return false;
  return true;
}

function isApprovalToken(value: unknown): value is ApprovalToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ApprovalToken>;
  return candidate.algorithm === "ECDSA_P256_SHA256"
    && typeof candidate.signature === "string"
    && candidate.signature.length >= 40
    && candidate.signature.length <= 256
    && BASE64URL.test(candidate.signature)
    && Boolean(candidate.payload)
    && typeof candidate.payload === "object"
    && !Array.isArray(candidate.payload);
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
    resourceId: proposal.resourceId,
    resourceLabel: proposal.resourceLabel,
    quantity: proposal.quantity,
    unit: proposal.unit,
    unitCost: proposal.unitCost,
    purpose: proposal.purpose,
    stateVersion: proposal.stateVersion,
    expiresAt: proposal.expiresAt,
    maxCost: proposal.totalCost,
  };
}

export async function hashPlan(
  plan: Pick<PlanDraft, "planId" | "incidentId" | "summary" | "rationale" | "revision" | "maxBudget" | "proposals">,
): Promise<string> {
  return sha256({
    planId: plan.planId,
    incidentId: plan.incidentId,
    summary: plan.summary,
    rationale: plan.rationale,
    revision: plan.revision,
    maximumCost: plan.maxBudget,
    scopes: plan.proposals.map(proposalScope).sort((a, b) => a.proposalId.localeCompare(b.proposalId)),
  });
}

export interface SessionSigner {
  sessionId: string;
  publicKeyJwk: JsonWebKey;
  sign: (payload: ApprovalPayload) => Promise<ApprovalToken>;
}

export async function createSessionSigner(sessionId: string = crypto.randomUUID()): Promise<SessionSigner> {
  if (!validText(sessionId, 160)) throw new TypeError("PACT session ID is invalid.");
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

export async function verifyApprovalToken(token: unknown, publicKeyJwk: JsonWebKey): Promise<boolean> {
  if (!isApprovalToken(token) || !isP256PublicJwk(publicKeyJwk)) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromBase64Url(token.signature),
      encoder.encode(canonicalize(token.payload)),
    );
  } catch {
    return false;
  }
}

export function isExpired(iso: string, now = Date.now()): boolean {
  const timestamp = Date.parse(iso);
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function validateApprovalEnvelope(
  token: unknown,
  expectedSessionId: string,
  now = Date.now(),
): ValidationResult {
  if (!isApprovalToken(token)) return fail("MALFORMED_APPROVAL", "Approval token shape is invalid.");
  const payload = token.payload;
  if (!validText(payload.sessionId, 160) || payload.sessionId !== expectedSessionId) {
    return fail("SESSION_MISMATCH", "Approval belongs to another Relay session.");
  }
  if (!Array.isArray(payload.scopes) || payload.scopes.length === 0) return fail("EMPTY_SCOPE", "Approval contains no proposal scopes.");
  if (payload.scopes.length > MAX_SCOPES) return fail("TOO_MANY_SCOPES", "Approval contains too many proposal scopes.");
  if (!validText(payload.planId, 180) || typeof payload.planHash !== "string" || payload.planHash.length !== 43 || !BASE64URL.test(payload.planHash)) {
    return fail("MALFORMED_APPROVAL", "Approval is missing a valid plan identity.");
  }

  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return fail("MALFORMED_TIME", "Approval timestamps are invalid.");
  if (issuedAt > now + CLOCK_SKEW_MS) return fail("APPROVAL_NOT_YET_VALID", "Approval issue time is in the future.");
  if (expiresAt <= now) return fail("APPROVAL_EXPIRED", "Human approval has expired.");
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_APPROVAL_LIFETIME_MS) {
    return fail("INVALID_APPROVAL_LIFETIME", "Approval lifetime exceeds the allowed window.");
  }

  const maximumCost = cents(payload.maximumCost);
  if (maximumCost === null) return fail("INVALID_COST_CEILING", "Approval cost ceiling is invalid.");

  const seen = new Set<string>();
  let aggregateCost = 0;
  for (const scope of payload.scopes) {
    if (!scope || typeof scope !== "object" || Array.isArray(scope) || !validText(scope.proposalId, 160)) {
      return fail("MALFORMED_SCOPE", "Approval contains a malformed proposal scope.");
    }
    if (seen.has(scope.proposalId)) return fail("DUPLICATE_SCOPE", "Approval repeats a proposal scope.");
    seen.add(scope.proposalId);
    if (!validProviderId(scope.providerId)) return fail("MALFORMED_SCOPE", "Approval contains an unknown provider.");
    if (!validOrigin(scope.providerOrigin)) return fail("INVALID_PROVIDER_ORIGIN", "Approval contains an invalid provider origin.");
    if (
      !validText(scope.resourceId, 80)
      || !validText(scope.resourceLabel, 120)
      || !validText(scope.unit, 80)
      || !validText(scope.purpose, 180)
      || !Number.isInteger(scope.stateVersion)
      || scope.stateVersion < 1
      || !Number.isInteger(scope.quantity)
      || scope.quantity < 1
    ) return fail("MALFORMED_SCOPE", "Approval scope has invalid operation data.");

    const unitCost = cents(scope.unitCost);
    const scopeCost = cents(scope.maxCost);
    if (unitCost === null || scopeCost === null || !Number.isSafeInteger(unitCost * scope.quantity)) {
      return fail("MALFORMED_SCOPE", "Approval scope has an invalid cost.");
    }
    if (scopeCost !== unitCost * scope.quantity) {
      return fail("SCOPE_COST_INCONSISTENT", "Approval scope cost does not equal quantity multiplied by unit cost.");
    }
    const scopeExpiry = Date.parse(scope.expiresAt);
    if (!Number.isFinite(scopeExpiry) || scopeExpiry <= issuedAt) {
      return fail("SCOPE_EXPIRED", "Approval contains a proposal that was not valid when consent was issued.");
    }
    aggregateCost += scopeCost;
    if (!Number.isSafeInteger(aggregateCost)) return fail("INVALID_COST_CEILING", "Aggregate approval cost is outside the safe numeric range.");
  }
  if (aggregateCost > maximumCost) {
    return fail("AGGREGATE_COST_EXCEEDED", "The sum of all approved proposal scopes exceeds the human cost ceiling.");
  }
  return { ok: true };
}

export function validateApprovalForProposal(
  token: unknown,
  proposal: ProviderProposal,
  expectedSessionId: string,
  now = Date.now(),
): ValidationResult {
  const envelope = validateApprovalEnvelope(token, expectedSessionId, now);
  if (!envelope.ok) return envelope;
  const approval = token as ApprovalToken;
  const scope = approval.payload.scopes.find((candidate) => candidate.proposalId === proposal.proposalId);
  if (!scope) return fail("OUT_OF_SCOPE", "Proposal is not covered by human approval.");
  if (scope.providerId !== proposal.providerId || scope.providerOrigin !== proposal.providerOrigin) {
    return fail("ORIGIN_SCOPE_MISMATCH", "Provider identity does not match approval scope.");
  }
  if (scope.stateVersion !== proposal.stateVersion) return fail("VERSION_SCOPE_MISMATCH", "Approved provider version differs from proposal.");
  if (
    scope.resourceId !== proposal.resourceId
    || scope.resourceLabel !== proposal.resourceLabel
    || scope.quantity !== proposal.quantity
    || scope.unit !== proposal.unit
    || !sameMoney(scope.unitCost, proposal.unitCost)
    || scope.purpose !== proposal.purpose
    || scope.expiresAt !== proposal.expiresAt
  ) {
    return fail("OPERATION_SCOPE_MISMATCH", "Proposal operation differs from the exact human-approved scope.");
  }
  if (!sameMoney(scope.maxCost, proposal.totalCost)) return fail("COST_SCOPE_MISMATCH", "Proposal cost differs from the exact human-approved scope.");
  return { ok: true };
}

export function validateApprovalForBatch(
  token: unknown,
  proposals: ProviderProposal[],
  expectedSessionId: string,
  providerId: ProviderId,
  providerOrigin: string,
  now = Date.now(),
): ValidationResult {
  const envelope = validateApprovalEnvelope(token, expectedSessionId, now);
  if (!envelope.ok) return envelope;
  if (!validProviderId(providerId) || !validOrigin(providerOrigin)) return fail("PROVIDER_BATCH_MISMATCH", "Commit target provider is invalid.");
  if (proposals.length === 0) return fail("NO_PROPOSALS", "No proposals were supplied for commit.");
  const approval = token as ApprovalToken;
  const approvedIds = approval.payload.scopes
    .filter((scope) => scope.providerId === providerId && scope.providerOrigin === providerOrigin)
    .map((scope) => scope.proposalId)
    .sort();
  const requestedIds = [...new Set(proposals.map((proposal) => proposal.proposalId))].sort();
  if (requestedIds.length !== proposals.length) return fail("DUPLICATE_PROPOSAL", "Commit batch repeats a proposal ID.");
  if (approvedIds.length !== requestedIds.length || approvedIds.some((id, index) => id !== requestedIds[index])) {
    return fail("INCOMPLETE_PROVIDER_BATCH", "Commit must include every human-approved proposal for this provider exactly once.");
  }
  for (const proposal of proposals) {
    if (proposal.providerId !== providerId || proposal.providerOrigin !== providerOrigin) {
      return fail("PROVIDER_BATCH_MISMATCH", "Commit batch contains a proposal from another provider origin.");
    }
    const proposalCheck = validateApprovalForProposal(approval, proposal, expectedSessionId, now);
    if (!proposalCheck.ok) return proposalCheck;
  }
  return { ok: true };
}
