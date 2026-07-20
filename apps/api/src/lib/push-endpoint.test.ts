import { describe, expect, it } from "bun:test";
import { isAllowedPushEndpoint } from "@/lib/push";

// /api/push/subscribe is unauthenticated by design, and whatever endpoint it
// stores gets POSTed to on every match event — so this guard is what stops the
// service being pointed at arbitrary URLs.
describe("isAllowedPushEndpoint", () => {
  it("accepts the real push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://android.googleapis.com/gcm/send/abc123",
      "https://web.push.apple.com/QABC123",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=xyz",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("rejects arbitrary hosts", () => {
    for (const url of [
      "https://example.com/collect",
      "https://attacker.test/webhook",
      "https://evil.com/fcm.googleapis.com", // host is what matters, not the path
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("rejects lookalike hostnames that merely end with a service name", () => {
    // ".push.apple.com" must not match "notpush.apple.com.attacker.test"
    expect(isAllowedPushEndpoint("https://push.apple.com.attacker.test/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.test/x")).toBe(false);
  });

  it("requires https", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("rejects non-URLs and other schemes", () => {
    for (const url of ["", "not a url", "javascript:alert(1)", "file:///etc/passwd"]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });
});
