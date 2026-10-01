import { describe, expect, it } from "bun:test";
import { applyUpdate } from "./swUpdate";

function fakeWaiting() {
  const listeners: Record<string, () => void> = {};
  const sw = {
    state: "installed",
    messages: [] as unknown[],
    postMessage(m: unknown) {
      this.messages.push(m);
    },
    addEventListener(type: string, fn: () => void) {
      listeners[type] = fn;
    },
    fire(type: string, state?: string) {
      if (state) this.state = state;
      listeners[type]?.();
    },
  };
  return sw;
}

function fakeContainer() {
  const listeners: Record<string, () => void> = {};
  return {
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    fire: (type: string) => listeners[type]?.(),
  };
}

const reg = (waiting: unknown) => ({ waiting }) as unknown as ServiceWorkerRegistration;

describe("applyUpdate", () => {
  it("reloads straight away when nothing is waiting", () => {
    let reloads = 0;
    applyUpdate(reg(null), { reload: () => reloads++, serviceWorker: fakeContainer() });
    expect(reloads).toBe(1);
  });

  it("asks the waiting worker to take over and reloads once it is activated (uncontrolled page)", () => {
    const sw = fakeWaiting();
    let reloads = 0;
    applyUpdate(reg(sw), { reload: () => reloads++, serviceWorker: fakeContainer(), timeoutMs: 60_000 });
    expect(sw.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reloads).toBe(0);
    sw.fire("statechange", "activated");
    expect(reloads).toBe(1);
  });

  it("reloads on controller change, only once", () => {
    const sw = fakeWaiting();
    const c = fakeContainer();
    let reloads = 0;
    applyUpdate(reg(sw), { reload: () => reloads++, serviceWorker: c, timeoutMs: 60_000 });
    c.fire("controllerchange");
    sw.fire("statechange", "activated");
    expect(reloads).toBe(1);
  });

  it("falls back to a timed reload if no event ever comes", async () => {
    let reloads = 0;
    applyUpdate(reg(fakeWaiting()), { reload: () => reloads++, serviceWorker: fakeContainer(), timeoutMs: 20 });
    await new Promise((r) => setTimeout(r, 40));
    expect(reloads).toBe(1);
  });
});
