export function createTopButton(translate) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "top-button secondary";
  const refresh = () => { button.textContent = translate("nav.top"); button.setAttribute("aria-label", translate("nav.top")); };
  button.addEventListener("click", () => {
    const target = document.scrollingElement || document.documentElement;
    if (target === document.documentElement || target === document.body) window.scrollTo({ top: 0, behavior: "smooth" });
    else target.scrollTo({ top: 0, behavior: "smooth" });
  });
  refresh();
  document.body.append(button);
  return { refresh };
}
