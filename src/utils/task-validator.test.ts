import { describe, it, expect } from "vitest";
import { validateTaskDefinition, validateTaskArray } from "./task-validator.js";

describe("validateTaskDefinition", () => {
  it("validates a complete task definition", () => {
    const result = validateTaskDefinition({
      subject: "Auth middleware",
      description: "Add JWT auth middleware",
      depends_on_subjects: [],
      estimated_complexity: "medium",
      task_type: "security",
      security_requirements: ["Must validate JWT"],
      performance_requirements: [],
      acceptance_criteria: ["Tests pass"],
      risk_level: "high",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.task.subject).toBe("Auth middleware");
      expect(result.task.task_type).toBe("security");
      expect(result.task.risk_level).toBe("high");
    }
  });

  it("validates a minimal task (only subject + description)", () => {
    const result = validateTaskDefinition({
      subject: "Minimal",
      description: "Just the basics",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.task.depends_on_subjects).toEqual([]);
      expect(result.task.estimated_complexity).toBe("medium");
      expect(result.task.task_type).toBe("general");
      expect(result.task.risk_level).toBe("medium");
      expect(result.task.security_requirements).toEqual([]);
      expect(result.task.performance_requirements).toEqual([]);
      expect(result.task.acceptance_criteria).toEqual([]);
    }
  });

  it("rejects missing subject", () => {
    const result = validateTaskDefinition({ description: "No subject" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("Missing or empty 'subject' field");
    }
  });

  it("rejects missing description", () => {
    const result = validateTaskDefinition({ subject: "No desc" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("Missing or empty 'description' field");
    }
  });

  it("rejects non-object input", () => {
    expect(validateTaskDefinition(null).valid).toBe(false);
    expect(validateTaskDefinition("string").valid).toBe(false);
    expect(validateTaskDefinition(42).valid).toBe(false);
  });

  it("defaults security task risk_level to high", () => {
    const result = validateTaskDefinition({
      subject: "Security task",
      description: "Fix vuln",
      task_type: "security",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.task.risk_level).toBe("high");
    }
  });

  it("normalizes invalid enum values to defaults", () => {
    const result = validateTaskDefinition({
      subject: "Bad enums",
      description: "Invalid values",
      estimated_complexity: "huge",
      task_type: "magic",
      risk_level: "extreme",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.task.estimated_complexity).toBe("medium");
      expect(result.task.task_type).toBe("general");
      expect(result.task.risk_level).toBe("medium");
    }
  });
});

describe("validateTaskArray", () => {
  it("validates a valid task array", () => {
    const json = JSON.stringify([
      { subject: "A", description: "First", depends_on_subjects: [] },
      { subject: "B", description: "Second", depends_on_subjects: ["A"] },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.tasks).toHaveLength(2);
    }
  });

  it("rejects invalid JSON", () => {
    const result = validateTaskArray("not json {[");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/Invalid JSON/);
    }
  });

  it("rejects non-array JSON", () => {
    const result = validateTaskArray('{"subject": "not array"}');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/Expected a JSON array/);
    }
  });

  it("rejects empty array", () => {
    const result = validateTaskArray("[]");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/empty/);
    }
  });

  it("reports individual task validation errors", () => {
    const json = JSON.stringify([
      { subject: "Good", description: "Valid" },
      { description: "Missing subject" },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/Task \[1\]/);
    }
  });

  it("detects duplicate subjects", () => {
    const json = JSON.stringify([
      { subject: "Dupe", description: "First" },
      { subject: "Dupe", description: "Second" },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Duplicate subject"))).toBe(true);
    }
  });

  it("detects dangling dependency references", () => {
    const json = JSON.stringify([
      { subject: "A", description: "First", depends_on_subjects: ["NonExistent"] },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("unknown subject"))).toBe(true);
    }
  });

  it("detects dependency cycles", () => {
    const json = JSON.stringify([
      { subject: "A", description: "First", depends_on_subjects: ["B"] },
      { subject: "B", description: "Second", depends_on_subjects: ["A"] },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
    }
  });

  it("validates a single task", () => {
    const json = JSON.stringify([
      { subject: "Solo", description: "Only one" },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.tasks).toHaveLength(1);
    }
  });

  it("populates defaults for all fields", () => {
    const json = JSON.stringify([
      { subject: "Defaults", description: "Check defaults" },
    ]);
    const result = validateTaskArray(json);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const task = result.tasks[0];
      expect(task.depends_on_subjects).toEqual([]);
      expect(task.estimated_complexity).toBe("medium");
      expect(task.task_type).toBe("general");
      expect(task.risk_level).toBe("medium");
    }
  });
});
