/** Disposable presentation over rendered headings. Never changes the editor DOM or selection. */
export function installNoteOutline(options: { document: Document; available(): boolean }) {
  const doc = options.document, win = doc.defaultView!;
  const panel = doc.getElementById("note-panel")!;
  const body = doc.getElementById("note-editor")!;
  const rail = doc.getElementById("note-outline")!;
  const control = doc.getElementById("note-outline-control") as HTMLButtonElement;
  const preview = doc.getElementById("note-outline-preview")!;
  const title = doc.getElementById("note-outline-title")!;
  const excerpt = doc.getElementById("note-outline-excerpt")!;
  let headings: HTMLElement[] = [], ticks: HTMLElement[] = [];
  let selected = -1, current = 0, frame = 0, stopped = false, dirty = true;
  const compact = win.matchMedia("(max-width: 680px)");
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const label = (heading: HTMLElement) => heading.textContent?.trim() || "Untitled section";

  function dismiss() { selected = -1; preview.hidden = true; paint(); }
  function paint() {
    ticks.forEach((tick, index) => {
      tick.dataset.current = String(index === current);
      const distance = selected < 0 ? Infinity : Math.abs(index - selected);
      tick.style.transform = `scaleX(${distance === 0 ? 1.4 : distance === 1 ? 1.2 : 1})`;
    });
    const index = selected < 0 ? current : selected;
    control.setAttribute("aria-label", headings[index]
      ? `Jump to section ${index + 1} of ${headings.length}: ${label(headings[index]!)}` : "Navigate sections");
  }
  function show(index: number) {
    if (rail.hidden || !headings.length) return;
    selected = Math.max(0, Math.min(headings.length - 1, index));
    const heading = headings[selected]!;
    title.textContent = label(heading);
    let text = "", next = heading.nextElementSibling;
    // Bound work and preview size; do not treat code/literal content as headings.
    for (let count = 0; next && count < 12 && text.length < 180; count++, next = next.nextElementSibling) {
      if (/^H[1-6]$/.test(next.tagName)) break;
      text += " " + (next.textContent || "").slice(0, 180);
    }
    excerpt.textContent = text.trim().slice(0, 180);
    excerpt.hidden = !excerpt.textContent;
    preview.hidden = false;
    const bounds = control.getBoundingClientRect();
    const y = bounds.top + (selected + .5) / headings.length * bounds.height;
    const top = Math.max(8, Math.min(win.innerHeight - preview.offsetHeight - 8, y - preview.offsetHeight / 2));
    preview.style.top = `${top - rail.getBoundingClientRect().top}px`;
    paint();
  }
  function refresh() {
    frame = 0;
    if (stopped) return;
    rail.hidden = !options.available() || compact.matches || body.hidden;
    if (rail.hidden) { dismiss(); return; }
    if (dirty) {
      dirty = false;
      const next = Array.from(body.querySelectorAll<HTMLElement>(":scope > :is(h1,h2,h3,h4,h5,h6)"));
      if (next.length !== headings.length || next.some((heading, i) => heading !== headings[i])) {
        headings = next;
        selected = -1; preview.hidden = true;
        ticks = headings.map((heading, index) => {
          const tick = doc.createElement("span");
          tick.className = "note-outline-tick";
          tick.style.width = `${24 - Number(heading.tagName[1]) * 2}px`;
          tick.style.top = `${(index + .5) / headings.length * 100}%`;
          tick.setAttribute("aria-hidden", "true");
          return tick;
        });
        control.replaceChildren(...ticks);
      }
    }
    rail.hidden = headings.length < 2;
    if (rail.hidden) { dismiss(); return; }
    control.style.height = `${Math.max(32, Math.min(headings.length * 16, 480, panel.clientHeight - 96))}px`;
    const top = panel.getBoundingClientRect().top + 48;
    current = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i]!.getBoundingClientRect().top <= top) current = i;
      else break;
    }
    // A short final section may hit the scroll limit before reaching the top.
    if (panel.scrollTop > 0 && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1
      && headings.at(-1)!.getBoundingClientRect().top < panel.getBoundingClientRect().bottom) current = headings.length - 1;
    if (selected >= 0) show(selected); else paint();
  }
  function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(refresh); }
  function sync() {
    if (!options.available()) {
      rail.hidden = true; dismiss(); headings = []; ticks = []; control.replaceChildren(); dirty = true;
    }
    schedule();
  }
  function pointerIndex(event: MouseEvent) {
    const bounds = control.getBoundingClientRect();
    return Math.max(0, Math.min(headings.length - 1, Math.floor((event.clientY - bounds.top) / bounds.height * headings.length)));
  }
  function jump(index: number) {
    if (rail.hidden || !options.available()) return;
    const heading = headings[index];
    if (!heading?.isConnected) return;
    panel.scrollTo({ top: panel.scrollTop + heading.getBoundingClientRect().top - panel.getBoundingClientRect().top - 40,
      behavior: reduced.matches ? "instant" : "smooth" });
  }
  control.addEventListener("mousemove", event => { if (!event.buttons) show(pointerIndex(event)); });
  control.addEventListener("mousedown", event => event.preventDefault());
  control.addEventListener("click", event => jump(event.detail ? pointerIndex(event) : selected < 0 ? current : selected));
  control.addEventListener("focus", () => show(current));
  control.addEventListener("blur", dismiss);
  rail.addEventListener("mouseleave", dismiss);
  control.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.isComposing) return;
    const index = selected < 0 ? current : selected;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Enter", " "].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowDown") show(index + 1);
    else if (event.key === "ArrowUp") show(index - 1);
    else if (event.key === "Home") show(0);
    else if (event.key === "End") show(headings.length - 1);
    else if (event.key === "Escape") dismiss();
    else if (event.key === "Enter" || event.key === " ") jump(index);
  });
  const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
  const mutations = new MutationObserver(() => { dirty = true; schedule(); });
  const sizes = new ResizeObserver(schedule);
  function start() {
    stopped = false; dirty = true;
    mutations.observe(body, { childList: true, subtree: true, characterData: true });
    sizes.observe(panel); sizes.observe(body);
    panel.addEventListener("scroll", schedule, { passive: true });
    win.addEventListener("resize", schedule);
    doc.addEventListener("keydown", onEscape);
    sync();
  }
  win.addEventListener("pagehide", () => {
    stopped = true; mutations.disconnect(); sizes.disconnect(); win.cancelAnimationFrame(frame); frame = 0;
    panel.removeEventListener("scroll", schedule); win.removeEventListener("resize", schedule); doc.removeEventListener("keydown", onEscape);
    rail.hidden = true; dismiss(); headings = []; ticks = []; control.replaceChildren();
  });
  win.addEventListener("pageshow", event => { if (event.persisted) start(); });
  start();
  return { sync };
}
