import "./fault-injection.css";

const shelterOrigin = new URL(
  import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174",
  window.location.href,
).origin;

const message = Object.freeze({ type: "relay_demo_inject_disruption" as const });
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
  detail.textContent = "Simulate a concurrent Shelter Grid capacity change while the agent is paused. This calls the provider's real one-shot state transition.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fault-button";
  button.textContent = "Change shelter capacity";
  button.setAttribute("aria-label", "Inject a real Shelter Grid capacity disruption");

  button.addEventListener("click", () => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-provider="shelter"]');
    if (!frame?.contentWindow) {
      button.textContent = "Shelter Grid unavailable";
      return;
    }

    frame.contentWindow.postMessage(message, shelterOrigin);
    button.disabled = true;
    button.textContent = "Disruption requested";
  });

  copy.append(label, detail);
  container.append(copy, button);
  actions.before(container);
}

const observer = new MutationObserver(injectConsentControl);
observer.observe(document.body, { childList: true, subtree: true });
injectConsentControl();

window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
