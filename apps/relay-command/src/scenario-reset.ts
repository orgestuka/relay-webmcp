import "./scenario-reset.css";

function installResetControl(): void {
  const target = document.querySelector<HTMLElement>(".top-status");
  if (!target || target.querySelector("#reset-scenario")) return;

  const button = document.createElement("button");
  button.id = "reset-scenario";
  button.type = "button";
  button.className = "scenario-reset";
  button.textContent = "Reset scenario";
  button.title = "Reload Relay Command and all provider frames back to deterministic seed state.";
  button.addEventListener("click", () => window.location.reload());
  target.append(button);
}

const observer = new MutationObserver(installResetControl);
observer.observe(document.body, { childList: true, subtree: true });
installResetControl();
window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
