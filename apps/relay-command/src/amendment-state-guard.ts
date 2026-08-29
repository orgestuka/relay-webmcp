export function amendmentAllowedStatus(status: unknown): boolean {
  return status === "VALIDATED";
}

function visiblePlanStatus(): string | null {
  const text = document.querySelector<HTMLElement>("#plan-status")?.textContent?.trim();
  return text ? text.replaceAll(" ", "_") : null;
}

function controls(): {
  input: HTMLInputElement | null;
  button: HTMLButtonElement | null;
} {
  return {
    input: document.querySelector<HTMLInputElement>("#authority-cap"),
    button: document.querySelector<HTMLButtonElement>("#apply-amendment"),
  };
}

function synchronize(): void {
  const status = visiblePlanStatus();
  const allowed = amendmentAllowedStatus(status);
  const { input, button } = controls();
  const reason = allowed
    ? "Tighten the maximum authority before consent."
    : `Authority amendment unavailable while plan status is ${status ?? "unknown"}. Restage a valid plan first.`;

  if (input) {
    input.disabled = !allowed;
    input.title = reason;
  }
  if (button) {
    button.disabled = !allowed;
    button.title = reason;
  }
}

function blockInvalidClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("#apply-amendment")) return;
  if (amendmentAllowedStatus(visiblePlanStatus())) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  synchronize();
}

const observer = new MutationObserver(synchronize);
document.addEventListener("click", blockInvalidClick, true);
observer.observe(document.body, { childList: true, subtree: true });
synchronize();

window.addEventListener("pagehide", () => {
  observer.disconnect();
  document.removeEventListener("click", blockInvalidClick, true);
}, { once: true });
