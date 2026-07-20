// iOS can only "install" a web app through Safari's Share → Add to Home Screen —
// there's no `beforeinstallprompt` to trigger it — and web push only works once
// installed. So this guide is effectively the gate to notifications on iPhone.
const DISMISS_KEY = "lucarne:install-dismissed";

/** Fired to open the install guide on demand (e.g. from Settings). */
export const INSTALL_EVENT = "lucarne:show-install";

/** Running as an installed app (Home Screen / standalone) rather than a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** iOS in a browser tab → the app can still be added to the Home Screen. */
export function canInstall(): boolean {
  return isIOS() && !isStandalone();
}

export function installDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode — just don't remember it */
  }
}

/** Re-open the guide manually (Settings), even once dismissed. */
export function openInstallGuide(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INSTALL_EVENT));
}
