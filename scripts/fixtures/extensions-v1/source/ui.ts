import type { ExtensionUIFactory } from "jumpybrain/extensions.js";
const activate: ExtensionUIFactory = api => {
  api.registerPanel("details", (container, data, context) => {
    container.textContent = JSON.stringify(data);
    const stop = () => { container.textContent = ""; };
    context.signal.addEventListener("abort", stop, { once: true });
    return () => { context.signal.removeEventListener("abort", stop); stop(); };
  });
  api.onDispose(() => {});
};
export default activate;
