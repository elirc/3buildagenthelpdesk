import { describe, expect, it } from "vitest";
import { JOB_LEASE_MS, WORKER_DEAD_MS, WORKER_STALE_MS, isLeaseExpired, workerHealth } from "@agentdesk/domain";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-05-21T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("isLeaseExpired", () => {
  it("reclaims a RUNNING job whose lease has run out", () => {
    expect(isLeaseExpired({ status: "RUNNING", lockedAt: ago(JOB_LEASE_MS + 1000) }, NOW)).toBe(true);
  });

  it("leaves a freshly claimed job alone", () => {
    expect(isLeaseExpired({ status: "RUNNING", lockedAt: ago(30_000) }, NOW)).toBe(false);
  });

  it("does not reclaim exactly at the boundary", () => {
    // Strictly greater than, so a job is never taken from a worker that is
    // still inside its lease by a millisecond.
    expect(isLeaseExpired({ status: "RUNNING", lockedAt: ago(JOB_LEASE_MS) }, NOW)).toBe(false);
    expect(isLeaseExpired({ status: "RUNNING", lockedAt: ago(JOB_LEASE_MS + 1) }, NOW)).toBe(true);
  });

  it("ignores a RUNNING job that holds no lease", () => {
    // No lockedAt means no worker has stamped it yet. Reclaiming would race
    // the worker that is about to.
    expect(isLeaseExpired({ status: "RUNNING", lockedAt: null }, NOW)).toBe(false);
  });

  it("ignores jobs that are not running, however old their lock", () => {
    const ancient = ago(JOB_LEASE_MS * 100);
    for (const status of ["QUEUED", "SUCCEEDED", "FAILED", "RETRYING", "DEAD_LETTERED"] as const) {
      expect(isLeaseExpired({ status, lockedAt: ancient }, NOW)).toBe(false);
    }
  });
});

describe("workerHealth", () => {
  it("reports a recently seen worker as healthy", () => {
    expect(workerHealth({ lastSeenAt: ago(5_000) }, NOW)).toBe("healthy");
  });

  it("reports a quiet worker as stale", () => {
    expect(workerHealth({ lastSeenAt: ago(WORKER_STALE_MS + 1_000) }, NOW)).toBe("stale");
  });

  it("reports a long-silent worker as dead", () => {
    expect(workerHealth({ lastSeenAt: ago(WORKER_DEAD_MS + 1_000) }, NOW)).toBe("dead");
  });

  it("uses inclusive boundaries so there is no gap between bands", () => {
    expect(workerHealth({ lastSeenAt: ago(WORKER_STALE_MS) }, NOW)).toBe("stale");
    expect(workerHealth({ lastSeenAt: ago(WORKER_DEAD_MS) }, NOW)).toBe("dead");
  });

  it("treats a worker seen in the future as healthy rather than throwing", () => {
    // Clock skew between the app and the database is normal; a negative
    // silence must not fall through into a worse band.
    expect(workerHealth({ lastSeenAt: new Date(NOW.getTime() + 10_000) }, NOW)).toBe("healthy");
  });
});
