import { describe, expect, it } from "vitest";
import {
  getPersona,
  formatPersonaPrompt,
  type WorkerPersona,
} from "./worker-personas.js";
import type { TaskType } from "./utils/types.js";

const ALL_TASK_TYPES: TaskType[] = [
  "security",
  "backend_api",
  "frontend_ui",
  "database",
  "testing",
  "infrastructure",
  "general",
];

describe("getPersona", () => {
  it("returns a persona for every task type", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);

      expect(persona).toBeDefined();
      expect(persona.role).toBeTruthy();
      expect(persona.identity).toBeTruthy();
      expect(persona.checklist).toBeInstanceOf(Array);
      expect(persona.checklist.length).toBeGreaterThan(0);
      expect(persona.antiPatterns).toBeInstanceOf(Array);
      expect(persona.antiPatterns.length).toBeGreaterThan(0);
      expect(persona.domainGuidance).toBeTruthy();
    }
  });

  it("returns security engineer for security tasks", () => {
    const persona = getPersona("security");
    expect(persona.role).toBe("Security Engineer");
  });

  it("returns backend engineer for backend_api tasks", () => {
    const persona = getPersona("backend_api");
    expect(persona.role).toBe("Backend Engineer");
  });

  it("returns database architect for database tasks", () => {
    const persona = getPersona("database");
    expect(persona.role).toBe("Database Architect");
  });

  it("returns frontend specialist for frontend_ui tasks", () => {
    const persona = getPersona("frontend_ui");
    expect(persona.role).toBe("Frontend Specialist");
  });

  it("returns test engineer for testing tasks", () => {
    const persona = getPersona("testing");
    expect(persona.role).toBe("Test Engineer");
  });

  it("returns infrastructure engineer for infrastructure tasks", () => {
    const persona = getPersona("infrastructure");
    expect(persona.role).toBe("Infrastructure Engineer");
  });

  it("returns software engineer for general tasks", () => {
    const persona = getPersona("general");
    expect(persona.role).toBe("Software Engineer");
  });

  it("ensures all personas have non-empty checklist items", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      for (const item of persona.checklist) {
        expect(item).toBeTruthy();
        expect(typeof item).toBe("string");
        expect(item.length).toBeGreaterThan(0);
      }
    }
  });

  it("ensures all personas have non-empty anti-patterns", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      for (const ap of persona.antiPatterns) {
        expect(ap).toBeTruthy();
        expect(typeof ap).toBe("string");
        expect(ap.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("formatPersonaPrompt", () => {
  it("produces valid markdown with all sections", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      // Check for required sections
      expect(prompt).toContain("## Your Role:");
      expect(prompt).toContain("### Pre-Completion Checklist");
      expect(prompt).toContain("### Anti-Patterns to Avoid");
      expect(prompt).toContain("### Domain Guidance");

      // Check for checklist items
      expect(prompt).toContain("- [ ]");

      // Check for anti-pattern format
      expect(prompt).toContain("- **AVOID:**");
    }
  });

  it("includes the role name in the header", () => {
    const persona = getPersona("security");
    const prompt = formatPersonaPrompt(persona);

    expect(prompt).toContain("## Your Role: Security Engineer");
  });

  it("includes all checklist items", () => {
    const persona = getPersona("testing");
    const prompt = formatPersonaPrompt(persona);

    for (const item of persona.checklist) {
      expect(prompt).toContain(item);
    }
  });

  it("includes all anti-patterns", () => {
    const persona = getPersona("frontend_ui");
    const prompt = formatPersonaPrompt(persona);

    for (const ap of persona.antiPatterns) {
      expect(prompt).toContain(ap);
    }
  });

  it("does not produce duplicate headers", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      const roleCount = (prompt.match(/## Your Role:/g) || []).length;
      expect(roleCount).toBe(1);

      const checklistCount = (prompt.match(/### Pre-Completion Checklist/g) || []).length;
      expect(checklistCount).toBe(1);

      const antiPatternsCount = (prompt.match(/### Anti-Patterns to Avoid/g) || []).length;
      expect(antiPatternsCount).toBe(1);

      const guidanceCount = (prompt.match(/### Domain Guidance/g) || []).length;
      expect(guidanceCount).toBe(1);
    }
  });

  it("includes the identity description", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      expect(prompt).toContain(persona.identity);
    }
  });

  it("includes domain guidance content", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      expect(prompt).toContain(persona.domainGuidance);
    }
  });

  it("formats checklist items with checkbox markers", () => {
    const persona = getPersona("database");
    const prompt = formatPersonaPrompt(persona);

    for (const item of persona.checklist) {
      expect(prompt).toContain(`- [ ] ${item}`);
    }
  });

  it("formats anti-patterns with AVOID prefix", () => {
    const persona = getPersona("backend_api");
    const prompt = formatPersonaPrompt(persona);

    for (const ap of persona.antiPatterns) {
      expect(prompt).toContain(`- **AVOID:** ${ap}`);
    }
  });

  it("returns a string type", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      expect(typeof prompt).toBe("string");
    }
  });

  it("produces non-empty output for all task types", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);
      const prompt = formatPersonaPrompt(persona);

      expect(prompt.length).toBeGreaterThan(100);
    }
  });

  it("handles security persona specific content", () => {
    const persona = getPersona("security");
    const prompt = formatPersonaPrompt(persona);

    // Security persona should have OWASP-related guidance
    expect(prompt).toContain("OWASP");
    expect(prompt).toContain("Injection");
    expect(prompt).toContain("authentication");
  });

  it("handles backend_api persona specific content", () => {
    const persona = getPersona("backend_api");
    const prompt = formatPersonaPrompt(persona);

    // Backend API persona should have API design guidance
    expect(prompt).toContain("API");
    expect(prompt).toContain("pagination");
    expect(prompt).toContain("HTTP");
  });

  it("handles database persona specific content", () => {
    const persona = getPersona("database");
    const prompt = formatPersonaPrompt(persona);

    // Database persona should have migration and index guidance
    expect(prompt).toContain("migration");
    expect(prompt).toContain("index");
    expect(prompt).toContain("constraint");
  });
});

describe("WorkerPersona interface compliance", () => {
  it("all personas have the required WorkerPersona shape", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const persona = getPersona(taskType);

      // Type-check at runtime that the object has all expected keys
      expect(persona).toHaveProperty("role");
      expect(persona).toHaveProperty("identity");
      expect(persona).toHaveProperty("checklist");
      expect(persona).toHaveProperty("antiPatterns");
      expect(persona).toHaveProperty("domainGuidance");

      // Verify types
      expect(typeof persona.role).toBe("string");
      expect(typeof persona.identity).toBe("string");
      expect(Array.isArray(persona.checklist)).toBe(true);
      expect(Array.isArray(persona.antiPatterns)).toBe(true);
      expect(typeof persona.domainGuidance).toBe("string");
    }
  });
});
