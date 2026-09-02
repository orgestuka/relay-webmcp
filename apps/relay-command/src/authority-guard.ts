import { incident } from "@relay/simulation";
import {
  executeLocalRegisteredTool,
  installToolInputGuard,
} from "@relay/webmcp-runtime";

interface PlanEnvelope {
  plan?: {
    maxBudget?: unknown;
    revision?: unknown;
    status?: unknown;
  } | null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export class HumanAuthorityCeiling {
  #maximum: number;

  constructor(initialMaximum: number) {
    if (!finitePositive(initialMaximum)) throw new TypeError("Human authority ceiling must be positive and finite.");
    this.#maximum = cents(initialMaximum);
  }

  get maximum(): number {
    return this.#maximum;
  }

  capStageInput(input: Record<string, unknown>): Record<string, unknown> {
    const requested = finitePositive(input.maxBudget) ? input.maxBudget : this.#maximum;
    return {
      ...input,
      maxBudget: Math.min(cents(requested), this.#maximum),
    };
  }

  confirmTightening(value: unknown): boolean {
    if (!finitePositive(value)) return false;
    const requested = cents(value);
    if (requested > this.#maximum) return false;
    this.#maximum = requested;
    return true;
  }
}

const authority = new HumanAuthorityCeiling(incident.maximumBudget);
let installed = false;

export function getHumanAuthorityCeiling(): number {
  return authority.maximum;
}

export function stageLockedStatus(status: unknown): boolean {
  return status === "AWAITING_APPROVAL"
    || status === "APPROVED"
    || status === "COMMITTED";
}

function parsePlanEnvelope(raw: unknown): PlanEnvelope | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as PlanEnvelope;
  } catch {
    return null;
  }
}

function authorityInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("#authority-cap");
}

function synchronizeControl(): void {
  const input = authorityInput();
  if (!input) return;

  if (!input.dataset.planMaximum) input.dataset.planMaximum = input.value;
  const planMaximum = Number(input.dataset.planMaximum);
  const effectiveMaximum = Number.isFinite(planMaximum)
    ? Math.min(planMaximum, authority.maximum)
    : authority.maximum;

  input.max = String(effectiveMaximum);
  if (Number(input.value) > effectiveMaximum) input.value = String(effectiveMaximum);
  input.title = `Authority may only stay the same or tighten. Current human ceiling: €${authority.maximum.toFixed(2)}.`;
}

function rejectIncrease(input: HTMLInputElement, maximum: number): void {
  input.value = String(maximum);
  input.setCustomValidity(`Authority cannot increase. Maximum permitted is €${maximum.toFixed(2)}.`);
  input.reportValidity();
  globalThis.setTimeout(() => input.setCustomValidity(""), 1800);
}

async function confirmAppliedAmendment(requested: number): Promise<void> {
  try {
    const envelope = parsePlanEnvelope(await executeLocalRegisteredTool("relay_get_plan", {}));
    const plan = envelope?.plan;
    if (!plan || plan.status !== "VALIDATED") return;
    if (!finitePositive(plan.maxBudget)) return;
    if (cents(plan.maxBudget) !== cents(requested)) return;

    authority.confirmTightening(plan.maxBudget);
    synchronizeControl();
  } catch (error) {
    console.warn("[Relay authority] Unable to confirm human amendment", error);
  }
}

export function installAuthorityGuard(): void {
  if (installed) return;
  installed = true;

  installToolInputGuard("relay_stage_plan", (input) => authority.capStageInput(input));

  const clickGuard = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("#apply-amendment")) return;

    const input = authorityInput();
    if (!input) return;

    // Command App deliberately normalizes amendment input to a whole euro.
    // Mirror that exact behavior so the durable authority state cannot diverge.
    const requested = Math.floor(Number(input.value));
    input.value = Number.isFinite(requested) ? String(requested) : input.value;

    const renderedPlanMaximum = Number(input.dataset.planMaximum);
    const maximum = Number.isFinite(renderedPlanMaximum)
      ? Math.min(renderedPlanMaximum, authority.maximum)
      : authority.maximum;

    if (!finitePositive(requested) || requested > maximum) {
      event.preventDefault();
      event.stopImmediatePropagation();
      rejectIncrease(input, maximum);
      return;
    }

    // Command App handles the amendment synchronously during event bubbling.
    // Confirm its resulting state afterward before changing the durable ceiling.
    queueMicrotask(() => void confirmAppliedAmendment(requested));
  };

  const observer = new MutationObserver(synchronizeControl);
  document.addEventListener("click", clickGuard, true);
  observer.observe(document.body, { childList: true, subtree: true });
  synchronizeControl();

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    document.removeEventListener("click", clickGuard, true);
  }, { once: true });
}
