/** The About / support dialog. Opened from Settings via a window event, the same
 *  pattern as the install guide. */
export const ABOUT_EVENT = "lucarne:show-about";

/** Where donations go — a passion project's coffee fund, not a paywall. */
export const KOFI_URL = "https://ko-fi.com/salty_max";

/** The public source — for anyone who wants to peek or contribute. */
export const GITHUB_URL = "https://github.com/salty-max/lucarne";

export function openAbout(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ABOUT_EVENT));
}
