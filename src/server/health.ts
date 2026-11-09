export type HealthReport = {
  status: 'ok';
  service: 'gajian';
  network: 'testnet';
  time: string;
};

/** Liveness payload. Database and RPC readiness checks are added once those layers exist. */
export function healthReport(now: Date = new Date()): HealthReport {
  return { status: 'ok', service: 'gajian', network: 'testnet', time: now.toISOString() };
}
