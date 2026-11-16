import { t } from "./i18n.js";

export function createProjectMenu({ titleKey = "project.actions", statusHost, host, actions }) {
  const root = document.createElement("span");
  root.className = "project-menu-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-menu-button secondary";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  const menuId = `project-menu-${Math.random().toString(36).slice(2)}`;
  button.setAttribute("aria-controls", menuId);
  const menu = document.createElement("div");
  menu.id = menuId;
  menu.className = "project-menu";
  menu.hidden = true;
  const status = document.createElement("span");
  status.className = "project-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  statusHost.append(status);
  const items = actions.map((action) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "project-menu-item";
    item.addEventListener("click", () => { close(true); action.onSelect(); });
    menu.append(item);
    return { ...action, item };
  });
  root.append(button);
  host.append(root);

  const close = (restoreFocus = false) => { if (menu.hidden) return; menu.hidden = true; menu.remove(); button.setAttribute("aria-expanded", "false"); if (restoreFocus) button.focus(); };
  const open = () => { root.append(menu); menu.hidden = false; button.setAttribute("aria-expanded", "true"); };
  button.addEventListener("click", () => menu.hidden ? open() : close());
  document.addEventListener("pointerdown", (event) => { if (menu.hidden || root.contains(event.target)) return; close(); }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !menu.hidden) { event.preventDefault(); close(true); } });
  const refresh = () => { button.textContent = `${t(titleKey)} ▼`; items.forEach((entry) => { const label = t(entry.labelKey); entry.item.textContent = label; entry.item.title = label; entry.item.setAttribute("aria-label", label); }); };
  const setStatus = (key) => { status.dataset.i18n = key; status.textContent = t(key); };
  refresh();
  setStatus("project.unsaved");
  return { root, button, menu, status, refresh, setStatus, close };
}

export function createProjectWarningDialog() {
  const overlay = document.createElement("div");
  overlay.className = "project-import-modal";
  overlay.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "project-import-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  const title = document.createElement("h2");
  const message = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "project-import-actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "secondary";
  const reselect = document.createElement("button");
  reselect.type = "button";
  actions.append(confirm);
  actions.append(reselect);
  dialog.append(title, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  title.id = `project-warning-title-${Math.random().toString(36).slice(2)}`;
  message.id = `project-warning-message-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.setAttribute("aria-describedby", message.id);
  let previousFocus = null;
  let onConfirm = null;
  let onReselect = null;
  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const open = (titleKey, messageKey, actions = {}) => {
    if (!overlay.hidden) return;
    previousFocus = document.activeElement;
    onConfirm = actions.onConfirm || null;
    onReselect = actions.onReselect || null;
    title.textContent = t(titleKey);
    message.textContent = t(messageKey);
    confirm.textContent = t("project.warningConfirm");
    reselect.textContent = t("project.warningReselect");
    overlay.hidden = false;
    reselect.focus();
  };
  const confirmWarning = () => { const callback = onConfirm; close(); callback?.(); };
  const reselectSource = () => { const callback = onReselect; close(); callback?.(); };
  confirm.addEventListener("click", confirmWarning);
  reselect.addEventListener("click", reselectSource);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); confirmWarning(); }
    if (event.key === "Tab") { event.preventDefault(); const next = document.activeElement === confirm ? reselect : confirm; next.focus(); }
  });
  return { open, close };
}
