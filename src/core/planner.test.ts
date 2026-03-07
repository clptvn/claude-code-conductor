import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Planner } from "./planner.js";

// Mock SDK dependencies for integration tests
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  createSdkMcpServer: vi.fn(() => ({ instance: { close: mockClose } })),
  tool: vi.fn((_name: string, _desc: string, _schema: unknown, handler: unknown) => ({ handler })),
}));

const mockQueryWithTimeout = vi.fn();
vi.mock("../utils/sdk-timeout.js", () => ({
  queryWithTimeout: (...args: unknown[]) => mockQueryWithTimeout(...args),
}));

// Access private methods for testing via type cast
type PlannerPrivate = {
  parseTaskDefinitions(planOutput: string): unknown[];
  readAndValidateTasksDraft(): Promise<unknown[]>;
};

function createPlanner(projectDir = "/tmp/test"): PlannerPrivate {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return new Planner(projectDir, logger as never) as unknown as PlannerPrivate;
}

// ============================================================
// Legacy parser tests (parseTaskDefinitions — still exists but
// no longer called from createPlan/replan)
// ============================================================

describe("Planner.parseTaskDefinitions (legacy parser)", () => {
  it("parses tasks from a standard ```json block", () => {
    const plan = `
# Implementation Plan

Some description here.

\`\`\`json
[
  {
    "subject": "Task 1",
    "description": "Do thing 1",
    "depends_on_subjects": [],
    "estimated_complexity": "small",
    "task_type": "general"
  },
  {
    "subject": "Task 2",
    "description": "Do thing 2",
    "depends_on_subjects": ["Task 1"],
    "estimated_complexity": "medium",
    "task_type": "backend_api"
  }
]
\`\`\`
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ subject: "Task 1" });
    expect(tasks[1]).toMatchObject({ subject: "Task 2" });
  });

  it("parses tasks from a bare JSON array (no fences)", () => {
    const plan = `
# Plan

Here are the tasks:

[
  {
    "subject": "Bare task",
    "description": "No fences",
    "depends_on_subjects": [],
    "estimated_complexity": "small",
    "task_type": "general"
  }
]
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ subject: "Bare task" });
  });

  it("recovers individual task objects when array is malformed (Strategy 3)", () => {
    const plan = `
# Plan

Here are the task definitions:

Task 1:
{"subject": "Individual task A", "description": "First task", "depends_on_subjects": [], "estimated_complexity": "small", "task_type": "general"}

Task 2:
{"subject": "Individual task B", "description": "Second task", "depends_on_subjects": ["Individual task A"], "estimated_complexity": "medium", "task_type": "backend_api"}

End of plan.
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ subject: "Individual task A" });
    expect(tasks[1]).toMatchObject({ subject: "Individual task B" });
  });

  it("handles embedded code fences in task descriptions", () => {
    const plan = `
# Plan

\`\`\`json
[
  {
    "subject": "Task with code",
    "description": "Create a file with content: \`\`\`ts\\nconst x = 1;\\n\`\`\`",
    "depends_on_subjects": [],
    "estimated_complexity": "small",
    "task_type": "general"
  }
]
\`\`\`
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ subject: "Task with code" });
  });

  it("returns empty array when no tasks can be found", () => {
    const plan = `
# Plan

This plan has no task definitions at all.
Just some prose about what to do.
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(0);
  });

  it("picks the largest valid JSON block when multiple exist", () => {
    const plan = `
\`\`\`json
[{"subject": "Small", "description": "One task", "depends_on_subjects": []}]
\`\`\`

Updated tasks:

\`\`\`json
[
  {"subject": "A", "description": "First", "depends_on_subjects": []},
  {"subject": "B", "description": "Second", "depends_on_subjects": []},
  {"subject": "C", "description": "Third", "depends_on_subjects": ["A"]}
]
\`\`\`
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(3);
  });

  it("fills in defaults for missing optional fields", () => {
    const plan = `
\`\`\`json
[{"subject": "Minimal", "description": "Only required fields"}]
\`\`\`
`;
    const tasks = createPlanner().parseTaskDefinitions(plan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      subject: "Minimal",
      description: "Only required fields",
      depends_on_subjects: [],
      estimated_complexity: "medium",
      task_type: "general",
      risk_level: "medium",
      security_requirements: [],
      performance_requirements: [],
      acceptance_criteria: [],
    });
  });
});

// ============================================================
// readAndValidateTasksDraft tests (new file-based approach)
// ============================================================

describe("Planner.readAndValidateTasksDraft", () => {
  let tmpDir: string;

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-test-"));
    await fs.mkdir(path.join(tmpDir, ".conductor"), { recursive: true });
  }

  async function cleanup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  it("reads and validates a valid tasks-draft.json", async () => {
    await setup();
    try {
      const tasks = [
        { subject: "A", description: "First", depends_on_subjects: [] },
        { subject: "B", description: "Second", depends_on_subjects: ["A"] },
      ];
      await fs.writeFile(
        path.join(tmpDir, ".conductor", "tasks-draft.json"),
        JSON.stringify(tasks),
      );
      const planner = createPlanner(tmpDir);
      const result = await planner.readAndValidateTasksDraft();
      expect(result).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks-draft.json is missing", async () => {
    await setup();
    try {
      const planner = createPlanner(tmpDir);
      await expect(planner.readAndValidateTasksDraft()).rejects.toThrow(
        /Planner did not write tasks-draft\.json/,
      );
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks-draft.json contains invalid JSON", async () => {
    await setup();
    try {
      await fs.writeFile(
        path.join(tmpDir, ".conductor", "tasks-draft.json"),
        "not json {[",
      );
      const planner = createPlanner(tmpDir);
      await expect(planner.readAndValidateTasksDraft()).rejects.toThrow(
        /failed validation/,
      );
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks-draft.json contains empty array", async () => {
    await setup();
    try {
      await fs.writeFile(
        path.join(tmpDir, ".conductor", "tasks-draft.json"),
        "[]",
      );
      const planner = createPlanner(tmpDir);
      await expect(planner.readAndValidateTasksDraft()).rejects.toThrow(
        /empty/,
      );
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks have validation errors", async () => {
    await setup();
    try {
      const tasks = [
        { description: "Missing subject" },
      ];
      await fs.writeFile(
        path.join(tmpDir, ".conductor", "tasks-draft.json"),
        JSON.stringify(tasks),
      );
      const planner = createPlanner(tmpDir);
      await expect(planner.readAndValidateTasksDraft()).rejects.toThrow(
        /failed validation/,
      );
    } finally {
      await cleanup();
    }
  });
});

// ============================================================
// Integration tests: createPlan reads from tasks-draft.json,
// MCP server is always closed
// ============================================================

describe("Planner.createPlan integration", () => {
  let tmpDir: string;

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-int-"));
    await fs.mkdir(path.join(tmpDir, ".conductor"), { recursive: true });
    mockClose.mockClear();
    mockQueryWithTimeout.mockReset();
  }

  async function cleanup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  it("succeeds when tasks-draft.json is written during session", async () => {
    await setup();
    try {
      const validTasks = [
        { subject: "A", description: "First", depends_on_subjects: [] },
      ];
      // Simulate the SDK session writing tasks-draft.json
      mockQueryWithTimeout.mockImplementation(async () => {
        await fs.writeFile(
          path.join(tmpDir, ".conductor", "tasks-draft.json"),
          JSON.stringify(validTasks),
        );
        return "# Plan\n\nSome plan markdown";
      });

      const planner = new Planner(tmpDir, {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      } as never);
      const result = await planner.createPlan("test feature", "Q&A context", 1);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].subject).toBe("A");
      expect(result.plan_markdown).toContain("# Plan");
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks-draft.json is not written and still closes MCP", async () => {
    await setup();
    try {
      mockQueryWithTimeout.mockResolvedValue("# Plan without tasks file");

      const planner = new Planner(tmpDir, {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      } as never);

      await expect(planner.createPlan("test", "qa", 1)).rejects.toThrow(
        /Planner did not write tasks-draft\.json/,
      );
      // MCP server must still be closed even on failure
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("closes MCP server even when queryWithTimeout throws", async () => {
    await setup();
    try {
      mockQueryWithTimeout.mockRejectedValue(new Error("SDK timeout"));

      const planner = new Planner(tmpDir, {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      } as never);

      await expect(planner.createPlan("test", "qa", 1)).rejects.toThrow("SDK timeout");
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });
});

// ============================================================
// Integration tests: replan reads from tasks-draft.json,
// MCP server is always closed
// ============================================================

describe("Planner.replan integration", () => {
  let tmpDir: string;

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-replan-"));
    await fs.mkdir(path.join(tmpDir, ".conductor"), { recursive: true });
    // Write a previous plan file that replan reads
    await fs.writeFile(path.join(tmpDir, ".conductor", "plan-v1.md"), "# Previous Plan\n");
    mockClose.mockClear();
    mockQueryWithTimeout.mockReset();
  }

  async function cleanup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  function makePlanner() {
    return new Planner(tmpDir, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    } as never);
  }

  it("succeeds when tasks-draft.json is written during replan session", async () => {
    await setup();
    try {
      const validTasks = [
        { subject: "Fix-A", description: "Fix first issue", depends_on_subjects: [] },
      ];
      mockQueryWithTimeout.mockImplementation(async () => {
        await fs.writeFile(
          path.join(tmpDir, ".conductor", "tasks-draft.json"),
          JSON.stringify(validTasks),
        );
        return "# Replan\n\nUpdated plan";
      });

      const result = await makePlanner().replan(
        "test feature",
        path.join(tmpDir, ".conductor", "plan-v1.md"),
        [], // completedTasks
        [], // failedTasks
        null, // codexFeedback
        2,
      );

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].subject).toBe("Fix-A");
      expect(result.plan_markdown).toContain("# Replan");
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("throws when tasks-draft.json is missing after replan and still closes MCP", async () => {
    await setup();
    try {
      mockQueryWithTimeout.mockResolvedValue("# Replan without tasks");

      await expect(
        makePlanner().replan("test", path.join(tmpDir, ".conductor", "plan-v1.md"), [], [], null, 2),
      ).rejects.toThrow(/Planner did not write tasks-draft\.json/);
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("closes MCP server even when replan queryWithTimeout throws", async () => {
    await setup();
    try {
      mockQueryWithTimeout.mockRejectedValue(new Error("replan timeout"));

      await expect(
        makePlanner().replan("test", path.join(tmpDir, ".conductor", "plan-v1.md"), [], [], null, 2),
      ).rejects.toThrow("replan timeout");
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });
});
