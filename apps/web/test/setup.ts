// Preloaded by bun test (see bunfig.toml). Registers a DOM so React Testing
// Library can render, and cleans up between tests. happy-dom must be registered
// before Testing Library is imported, hence the dynamic imports.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

afterEach(() => cleanup());
