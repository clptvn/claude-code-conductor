import { describe, expect, it } from "vitest";

import { coerceLogText, detectProviderRateLimit } from "./provider-limit.js";

describe("coerceLogText", () => {
  it("returns an empty string for undefined values", () => {
    expect(coerceLogText(undefined)).toBe("");
  });

  it("serializes objects for logging", () => {
    expect(coerceLogText({ ok: true })).toBe('{"ok":true}');
  });
});

describe("detectProviderRateLimit", () => {
  it("detects common limit messages", () => {
    expect(
      detectProviderRateLimit("claude", "You've hit your limit · resets 7am (America/Vancouver)"),
    ).toMatchObject({
      provider: "claude",
    });
  });

  it("captures ISO reset hints when present", () => {
    expect(
      detectProviderRateLimit("codex", "rate limit exceeded until 2026-03-06T15:00:00.000Z"),
    ).toMatchObject({
      provider: "codex",
      resetsAt: "2026-03-06T15:00:00.000Z",
    });
  });

  it("detects 'rate limited' with a space separator", () => {
    expect(
      detectProviderRateLimit("claude", "Your account is rate limited, please wait"),
    ).toMatchObject({
      provider: "claude",
    });
  });

  it("ignores ordinary errors", () => {
    expect(detectProviderRateLimit("codex", "command failed with exit code 1")).toBeNull();
  });

  it("detects HTTP 429 pattern in message", () => {
    expect(
      detectProviderRateLimit("claude", "Error: HTTP 429 returned from API"),
    ).toMatchObject({
      provider: "claude",
    });
  });

  it("detects status: 429 pattern in message", () => {
    expect(
      detectProviderRateLimit("claude", "Request failed with status: 429"),
    ).toMatchObject({
      provider: "claude",
    });
  });

  it("detects rate limit via httpStatusCode parameter", () => {
    expect(
      detectProviderRateLimit("claude", "", 429),
    ).toMatchObject({
      provider: "claude",
      detail: "HTTP 429 Too Many Requests",
    });
  });

  it("prioritizes httpStatusCode over pattern matching", () => {
    // Even with a non-rate-limit message, 429 status code should trigger detection
    expect(
      detectProviderRateLimit("claude", "some random error", 429),
    ).toMatchObject({
      provider: "claude",
      detail: "some random error",
    });
  });

  it("extracts reset hint with httpStatusCode", () => {
    expect(
      detectProviderRateLimit("claude", "retry after 2026-03-06T15:00:00.000Z", 429),
    ).toMatchObject({
      provider: "claude",
      resetsAt: "2026-03-06T15:00:00.000Z",
    });
  });

  it("does not trigger on non-429 status codes", () => {
    expect(
      detectProviderRateLimit("claude", "some error", 500),
    ).toBeNull();
  });
});
