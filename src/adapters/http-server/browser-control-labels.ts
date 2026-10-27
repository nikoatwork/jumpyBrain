// One top-layer label for existing titled controls, including disabled buttons.
// Delegation also covers host/extension controls added after shell startup.
export function installControlLabels(doc: Document) {
  const label = doc.createElement("div");
  label.id = "control-label"; label.setAttribute("role", "tooltip");
  if (typeof label.showPopover !== "function") return;
  label.setAttribute("popover", "manual"); doc.body.append(label);
  let active: HTMLElement | null = null, title = "", described = "";
  function hide() {
    if (!active) return;
    if (title && !active.hasAttribute("title")) active.title = title;
    if (described) active.setAttribute("aria-describedby", described); else active.removeAttribute("aria-describedby");
    active = null; label.hidePopover();
  }
  function show(target: EventTarget | null) {
    const control = target instanceof Element ? target.closest<HTMLElement>("button, a, select, [role=button]") : null;
    if (control === active) return;
    hide();
    if (!control) return;
    const text = control.title || (control.querySelector("svg") ? control.getAttribute("aria-label") : "");
    if (!text) return;
    active = control; title = control.title; described = control.getAttribute("aria-describedby") || "";
    control.removeAttribute("title");
    control.setAttribute("aria-describedby", [described, label.id].filter(Boolean).join(" "));
    label.textContent = text; label.showPopover();
    position();
  }
  function position() {
    if (!active) return;
    const box = active.getBoundingClientRect(), size = label.getBoundingClientRect();
    const win = doc.defaultView!;
    label.style.left = Math.max(8, Math.min(box.x + box.width / 2 - size.width / 2, win.innerWidth - size.width - 8)) + "px";
    label.style.top = Math.max(8, box.bottom + size.height + 12 < win.innerHeight ? box.bottom + 6 : box.top - size.height - 6) + "px";
  }
  doc.addEventListener("pointerover", event => show(event.target));
  doc.addEventListener("pointerout", event => {
    if (active && active !== doc.activeElement && !active.contains(event.relatedTarget as Node | null)) hide();
  });
  doc.addEventListener("focusin", event => show(event.target));
  doc.addEventListener("focusout", hide);
  doc.addEventListener("click", hide);
  doc.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  doc.addEventListener("scroll", () => { if (active === doc.activeElement) position(); else hide(); }, true);
  doc.defaultView!.addEventListener("resize", hide);
}
