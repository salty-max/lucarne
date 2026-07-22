/** The About / support dialog. Opened from Settings via a window event, the same
 *  pattern as the install guide. */
export const ABOUT_EVENT = "lucarne:show-about";

/** Where donations go — a passion project's coffee fund, not a paywall. */
export const KOFI_URL = "https://ko-fi.com/salty_max";

export function openAbout(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ABOUT_EVENT));
}
