/**
 * Guards the /api/cron/* endpoints. Vercel Cron automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when the env var is set, and the
 * external live-poller pinger must send the same header. Fails closed.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
