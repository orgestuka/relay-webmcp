import "./fault-injection.css";
import { readCurrentPlanSnapshot } from "./command-app";
import { shelterDisruptionForPlan } from "./fault-injection-target";

const shelterOrigin = new URL(
  import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174",
  window.location.href,
).origin;

const hint = "During CONSENT, use the red demo control inside the approval sheet to prove stale plans fail closed.";

function updateProofHint(): void {
  const foot = document.querySelector<HTMLElement>(".proof-foot");
  if (foot && foot.textContent !== hint) foot.textContent = hint;
}

function injectConsentControl(): void {
  updateProofHint();

  const sheet = document.querySelector<HTMLElement>(".approval-sheet");
  if (!sheet || sheet.querySelector<HTMLElement>("[data-fault-injection]")) return;

  const actions = sheet.querySelector<HTMLElement>(".approval-actions");
  if (!actions) return;

  const container = document.createElement("div");
  container.className = "fault-injection";
  container.dataset.faultInjection = "true";

  const copy = document.createElement("div");
  copy.className = "fault-copy";

  const label = document.createElement("span");
  label.textContent = "DEMO FAULT INJECTION";

  const detail = document.createElement("small");
  detail.textContent = "Make the staged plan unsafe by reducing its largest live Shelter Grid allocation. The provider advances state and revokes every old quote.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fault-button";
  button.textContent = "Disrupt active shelter";
  button.setAttribute("aria-label", "Disrupt the largest shelter allocation in the staged plan");

  button.addEventListener("click", () => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-provider="shelter"]');
    if (!frame?.contentWindow) {
      button.textContent = "Shelter Grid unavailable";
      return;
    }

    const target = shelterDisruptionForPlan(readCurrentPlanSnapshot());
    if (!target) {
      button.textContent = "No active shelter allocation";
      return;
    }

    frame.contentWindow.postMessage(target.message, shelterOrigin);
    button.disabled = true;
    button.textContent = `${target.resourceLabel} disruption requested`;
  });

  copy.append(label, detail);
  container.append(copy, button);
  actions.before(container);
}

const observer = new MutationObserver(injectConsentControl);
observer.observe(document.body, { childList: true, subtree: true });
injectConsentControl();

window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
