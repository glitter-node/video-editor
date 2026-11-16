import { initializeLanguage } from "./i18n.js";
import { initializeTheme } from "./theme.js";

function initializeHeroTitle() {
  const title = document.getElementById("hero-title");
  if (!title) return;
  title.removeAttribute("data-i18n");
  const firstLine = document.createElement("span");
  const secondLine = document.createElement("span");
  firstLine.className = "hero-title-line";
  secondLine.className = "hero-title-line";
  firstLine.dataset.i18n = "hero.titleFirst";
  secondLine.dataset.i18n = "hero.titleSecond";
  title.replaceChildren(
    firstLine,
    secondLine
  );
}

function initializeHeroDescription() {
  const description = document.querySelector(".hero-description");
  if (!description) return;
  description.removeAttribute("data-i18n");
  const firstLine = document.createElement("span");
  const secondLine = document.createElement("span");
  const breakLine = document.createElement("br");
  firstLine.dataset.i18n = "hero.descriptionFirst";
  secondLine.dataset.i18n = "hero.descriptionSecond";
  description.replaceChildren(firstLine, breakLine, secondLine);
}

initializeHeroTitle();
initializeHeroDescription();
initializeLanguage(document.getElementById("languageSelect"));
initializeTheme(document.getElementById("themeSelect"));
