import { afterEach, describe, expect, it } from "bun:test";
import { authorizeCron } from "./auth";

const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function req(authorization?: string): Request {
  return new Request(
    "http://x/api/cron/live",
    authorization ? { headers: { authorization } } : undefined,
  );
}

describe("authorizeCron", () => {
  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(req("Bearer whatever"))).toBe(false);
  });

  it("rejects a missing or wrong header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req())).toBe(false);
    expect(authorizeCron(req("Bearer nope"))).toBe(false);
    expect(authorizeCron(req("s3cret"))).toBe(false); // missing "Bearer "
  });

  it("accepts the correct bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Bearer s3cret"))).toBe(true);
  });
});
