import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UsageMonitor } from "./usage-monitor.js";
import { Logger } from "../utils/logger.js";

// Stub fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock fs (used by both Logger and UsageMonitor for credential reads)
vi.mock("fs", () => {
  const mockStream = { write: vi.fn(), end: vi.fn(), on: vi.fn() };
  return {
    default: {
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(() => mockStream),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not found"); },
    },
  };
});

vi.mock("node:child_process", () => ({
  execSync: () => { throw new Error("no keychain"); },
}));

const testLogger = new Logger("/tmp/test-logs", "usage-monitor-test");

function makeMonitor(overrides?: { pollIntervalMs?: number }) {
  return new UsageMonitor({
    pollIntervalMs: overrides?.pollIntervalMs ?? 60_000,
    onWarning: () => {},
    onCritical: () => {},
    logger: testLogger,
  });
}

function makeApiResponse(fiveHourUtil: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      five_hour: { utilization: fiveHourUtil, resets_at: "2026-01-01T00:00:00Z" },
      seven_day: { utilization: 1.0, resets_at: "2026-01-07T00:00:00Z" },
    }),
  };
}

function make429Response() {
  return { ok: false, status: 429, statusText: "Too Many Requests" };
}

/**
 * poll() does internal sleep() calls for retry backoff (1s, 2s, 4s).
 * With fake timers we need to advance time for those sleeps to resolve.
 * We run the poll in parallel with timer advancement.
 */
async function pollWithFakeTimers(monitor: UsageMonitor): Promise<void> {
  const pollPromise = monitor.poll();
  // Advance past all retry backoff sleeps (1s + 2s + 4s = 7s total)
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  await pollPromise;
}

describe("UsageMonitor staleness tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    fetchMock.mockReset();
  });

  it("starts with zero consecutive failures and not stale", () => {
    const monitor = makeMonitor();
    expect(monitor.getConsecutiveFailures()).toBe(0);
    expect(monitor.getStaleDurationMs()).toBe(0);
    expect(monitor.isDataStale()).toBe(false);
  });

  it("records successful poll and resets staleness", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(makeApiResponse(5.0));

    await monitor.poll();

    expect(monitor.getConsecutiveFailures()).toBe(0);
    expect(monitor.isDataStale()).toBe(false);
  });

  it("tracks consecutive failures on 429 responses", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(make429Response());

    await pollWithFakeTimers(monitor);

    expect(monitor.getConsecutiveFailures()).toBe(1);
  });

  it("resets consecutive failures after a successful poll", async () => {
    const monitor = makeMonitor();

    // First poll: all retries fail with 429
    fetchMock.mockResolvedValue(make429Response());
    await pollWithFakeTimers(monitor);
    expect(monitor.getConsecutiveFailures()).toBe(1);

    // Second poll: success
    fetchMock.mockResolvedValue(makeApiResponse(10.0));
    await monitor.poll();
    expect(monitor.getConsecutiveFailures()).toBe(0);
  });

  it("reports stale after USAGE_STALE_THRESHOLD_MS without successful poll", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(makeApiResponse(5.0));

    await monitor.poll();
    expect(monitor.isDataStale()).toBe(false);

    // Advance time past 5 min stale threshold
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(monitor.isDataStale()).toBe(true);
    expect(monitor.getStaleDurationMs()).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("clears stale status on successful poll", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(makeApiResponse(5.0));

    await monitor.poll();
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(monitor.isDataStale()).toBe(true);

    await monitor.poll();
    expect(monitor.isDataStale()).toBe(false);
  });

  it("accumulates consecutive failures across multiple polls", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(make429Response());

    await pollWithFakeTimers(monitor);
    await pollWithFakeTimers(monitor);
    await pollWithFakeTimers(monitor);

    expect(monitor.getConsecutiveFailures()).toBe(3);
  });

  it("tracks failure on network errors", async () => {
    const monitor = makeMonitor();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await pollWithFakeTimers(monitor);

    expect(monitor.getConsecutiveFailures()).toBe(1);
  });

  it("tracks failure when no OAuth token is available", async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const monitor = makeMonitor();

    await monitor.poll();

    expect(monitor.getConsecutiveFailures()).toBe(1);
  });
});

describe("UsageMonitor adaptive polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    fetchMock.mockReset();
  });

  it("start() schedules polling and stop() clears it", async () => {
    const monitor = makeMonitor({ pollIntervalMs: 1000 });
    fetchMock.mockResolvedValue(makeApiResponse(5.0));

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    monitor.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not start a second poller if already running", async () => {
    const monitor = makeMonitor();
    fetchMock.mockResolvedValue(makeApiResponse(5.0));

    monitor.start();
    monitor.start(); // Should warn but not create another
    await vi.advanceTimersByTimeAsync(0);

    monitor.stop();
  });
});
