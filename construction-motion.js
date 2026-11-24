const pondBuild = document.querySelector("[data-pond-build]");

if (pondBuild) {
  const visual = pondBuild.querySelector(".pond-build-visual");
  const controls = pondBuild.querySelector(".pond-build-controls");
  const buttons = Array.from(controls.querySelectorAll("[data-build-step]"));
  const layers = Array.from(visual.querySelectorAll("[data-pond-layer]"));
  const steps = pondBuild.querySelectorAll(".pond-build-steps li");

  function showPondStep(step) {
    visual.dataset.buildStep = String(step);

    for (const layer of layers) {
      const appearAt = Number(layer.dataset.pondLayer);
      const disappearAt = Number(layer.dataset.pondUntil || Infinity);
      layer.classList.toggle("is-hidden", step < appearAt || step >= disappearAt);
    }

    buttons.forEach((button, index) => {
      const isCurrent = Number(button.dataset.buildStep) === step;
      button.setAttribute("aria-pressed", String(isCurrent));
      steps[index].classList.toggle("is-current", isCurrent);
    });
  }

  showPondStep(1);
  controls.hidden = false;
  pondBuild.querySelector(".pond-build-instruction").hidden = false;

  for (const button of buttons) {
    button.addEventListener("click", () => showPondStep(Number(button.dataset.buildStep)));
  }
}
