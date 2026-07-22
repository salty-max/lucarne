/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

/** Semver from package.json, injected by Vite `define`. */
declare const __APP_VERSION__: string;
/** ISO date (YYYY-MM-DD) the bundle was built, injected by Vite `define`. */
declare const __BUILD_DATE__: string;
