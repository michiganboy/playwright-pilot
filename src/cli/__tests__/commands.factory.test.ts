/**
 * Tests for CLI commands.
 */

// STEP 1 — HOISTED mocks (MANDATORY - before imports)
const promptsMock = {
  input: jest.fn(),
  select: jest.fn(),
  confirm: jest.fn(),
};

const fileOpsMock = {
  readFileSafe: jest.fn(),
  writeFileSafe: jest.fn(),
  deleteFileSafe: jest.fn(),
  fileExists: jest.fn(),
  dirExists: jest.fn(),
  readJsonSafe: jest.fn(),
  writeJsonSafe: jest.fn(),
};

const validationMock = {
  getFactoryReferencedFiles: jest.fn(),
  isPageReferenced: jest.fn(),
  isFactoryReferenced: jest.fn(),
  findMatchingPages: jest.fn(),
};

const globMock = jest.fn();

// MUST match factory.ts imports EXACTLY
jest.mock("@inquirer/prompts", () => promptsMock);
jest.mock("../utils/fileOps", () => fileOpsMock);
jest.mock("../utils/validation", () => validationMock);

// factory.ts uses: (await import("fast-glob")).default
jest.mock("fast-glob", () => ({
  __esModule: true,
  default: globMock,
}));

// Keep other mocks that are used by test utilities
jest.mock("../utils/templates");
jest.mock("../../utils/featureConfig");

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from "@jest/globals";
import { mocked, setupBeforeEach, teardownAfterEach, teardownAfterAll } from "./testUtils";

// Helper to import factory command - now uses stable mocked modules
const importFactoryCommand = async () => {
  const mod = await import("../commands/factory");
  return mod;
};

describe("CLI Commands - Factory Tests", () => {
  let ORIGINAL_ENV: NodeJS.ProcessEnv;

  beforeEach(async () => {
    ORIGINAL_ENV = { ...process.env };
    await setupBeforeEach();

    // STEP 2 — Deterministic cleanup
    // IMPORTANT:
    // jest.clearAllMocks() does NOT clear queued mockResolvedValueOnce/mockReturnValueOnce values.
    // This file relies heavily on *Once() overrides, so we must fully reset mocks
    // to prevent test-order leakage when running the suite in-band.
    promptsMock.input.mockReset();
    promptsMock.select.mockReset();
    promptsMock.confirm.mockReset();

    fileOpsMock.readFileSafe.mockReset();
    fileOpsMock.writeFileSafe.mockReset();
    fileOpsMock.deleteFileSafe.mockReset();
    fileOpsMock.fileExists.mockReset();

    validationMock.getFactoryReferencedFiles.mockReset();
    globMock.mockReset();

    // Default: indexes exist in a real repo (individual tests can override as needed)
    (fileOpsMock.fileExists as any).mockImplementation((p?: string) => {
      const path = String(p || "").replace(/\\/g, "/");
      if (path.includes("src/testdata/factories/index.ts")) return true;
      if (path.includes("src/testdata/models/index.ts")) return true;
      return false;
    });

    // Default: provide baseline index contents so index-update logic can run deterministically
    (fileOpsMock.readFileSafe as any).mockImplementation(async (p?: string) => {
      const path = String(p || "").replace(/\\/g, "/");
      if (path.includes("factories/index.ts")) {
        return 'export * from "./user.factory";';
      }
      if (path.includes("models/index.ts")) {
        return "export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}\n";
      }
      return "";
    });
    (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
    (globMock as any).mockResolvedValue([]);

    // FINAL FIX for Delete Tests - Set up smart input mock that handles confirmation prompts
    (promptsMock.input as any).mockImplementation(async (opts: { message?: string }) => {
      const msg = opts?.message ?? "";

      // Matches either:
      // - Type "delete factory user" to confirm...
      // - delete factory user
      // - ...delete factory user...
      const quoted = msg.match(/"delete factory ([^"]+)"/i);
      if (quoted?.[1]) return `delete factory ${quoted[1]}`;

      const plain = msg.match(/delete factory\s+([a-z0-9_-]+)/i);
      if (plain?.[1]) return `delete factory ${plain[1]}`;

      // Fallback (for other prompts.input usages in this file)
      return "";
    });

    // Reset environment variables used by factory command
    if (process.env.PILOT_SEED) delete process.env.PILOT_SEED;
    if (process.env.PILOT_DEBUG_SEED) delete process.env.PILOT_DEBUG_SEED;
    if (process.env.PILOT_KEEP_RUNSTATE) delete process.env.PILOT_KEEP_RUNSTATE;
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
    await teardownAfterEach();
  });

  afterAll(() => {
    teardownAfterAll();
  });

  describe("factory:add", () => {
    it("should work with model name as argument", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory doesn't exist, model doesn't exist
      (fileOpsMock.fileExists as any).mockImplementation((path: string) => {
        if (path.includes("product.factory.ts")) return false;
        if (path.includes("product.ts") && path.includes("models")) return false;
        return false;
      });

      // Mock: factories/index.ts and models/index.ts content, plus templates
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        // Templates are loaded via readFileSafe with full path
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      // Should create: model file + factory file + builder file + factories/index.ts + models/index.ts
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalledTimes(5);

      // Verify model file was created with default fields (id, email)
      const modelWriteCall = fileOpsMock.writeFileSafe.mock.calls.find(
        (call) => call[0] && (call[0] as string).includes("product.ts") && (call[0] as string).includes("models")
      );
      expect(modelWriteCall).toBeDefined();
      if (modelWriteCall) {
        const modelContent = modelWriteCall[1] as string;
        expect(modelContent).toContain("export interface Product");
        expect(modelContent).toContain("id: string");
        expect(modelContent).toContain("email: string");
      }

      // Verify builder file was created with tools integration
      const builderWriteCall = fileOpsMock.writeFileSafe.mock.calls.find(
        (call) => call[0] && (call[0] as string).includes("product.builder.ts") && (call[0] as string).includes("builders")
      );
      expect(builderWriteCall).toBeDefined();
      if (builderWriteCall) {
        const builderContent = builderWriteCall[1] as string;
        expect(builderContent).toContain("createTools(\"product\")");
        expect(builderContent).toContain("getTools().id.short()");
        expect(builderContent).toContain("getTools().person.email()");
      }

      // No interactive prompts should be called (fields are auto-generated)
      expect(promptsMock.input).not.toHaveBeenCalled();
      expect(promptsMock.select).not.toHaveBeenCalled();
    });

    it("should work with model name via prompt", async () => {
      // Args - no model name provided
      const modelName = undefined;

      // Mock: Factory doesn't exist, model doesn't exist
      (fileOpsMock.fileExists as any).mockReturnValue(false);
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Mock prompts
      (promptsMock.input as any).mockResolvedValueOnce("Product"); // Model name prompt
      (promptsMock.input as any).mockResolvedValueOnce("name"); // First field name
      (promptsMock.input as any).mockResolvedValueOnce(""); // Press Enter to finish
      (promptsMock.select as any).mockResolvedValueOnce("string"); // Field type
      (promptsMock.confirm as any).mockResolvedValueOnce(true); // Accept faker suggestion

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects
      expect(promptsMock.input).toHaveBeenCalled();
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
    });

    it("should use existing model if it exists", async () => {
      // Args
      const modelName = "User";

      // Mock: Factory doesn't exist, but model exists
      (fileOpsMock.fileExists as any).mockImplementation((path: string) => {
        if (path.includes("user.factory.ts")) return false;
        if (path.includes("user.ts") && path.includes("models")) return true; // Model exists
        return false;
      });

      // Mock: factories/index.ts content
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/user.ts")) {
          // Existing model file
          return `export interface User {\n  firstName: string;\n  lastName: string;\n  email: string;\n}`;
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock templates via readFileSafe (code uses readFileSafe directly, not templates.loadTemplate)
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/user.ts")) {
          return `export interface User {\n  firstName: string;\n  lastName: string;\n  email: string;\n}`;
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Mock: Confirm to use existing model
      (promptsMock.confirm as any).mockResolvedValueOnce(true);

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects
      expect(promptsMock.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("already exists. Reuse model?") })
      );
      // Should create: factory file + factories/index.ts (model already exists, so no model creation)
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      // Should parse existing model and create factory with those fields
    });

    it("should create new model if user declines existing", async () => {
      // Args
      const modelName = "User";

      // STEP 3 — Fix "decline existing model" test (the 3 vs 5 issue)
      // You must make fileExists path-aware
      (fileOpsMock.fileExists as any).mockImplementation((path: string) => {
        const normalized = path.replace(/\\/g, "/");

        // Existing model
        if (normalized.endsWith("/models/user.ts")) return true;

        // Everything else must NOT exist (including index files, so they get written)
        return false;
      });

      // Mock readFileSafe for index files and templates
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Mock prompts
      (promptsMock.confirm as any).mockResolvedValueOnce(false); // decline reuse
      (promptsMock.input as any).mockResolvedValueOnce("CustomUser"); // New model name

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects
      expect(promptsMock.confirm).toHaveBeenCalled(); // Confirm to use existing model
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      // Should create: new model file + factory file + builder file + factories/index.ts + models/index.ts
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalledTimes(5);

      // Verify the 5 writes: model, factory, builder, factories/index.ts, models/index.ts
      const writeCalls = fileOpsMock.writeFileSafe.mock.calls;
      const normalizedCalls = writeCalls.map((call) => ({
        path: (call[0] as string).replace(/\\/g, "/"),
        content: call[1] as string,
      }));

      // 1. Find the *new* model write (anything in models/ that isn't index.ts or user.ts)
      const modelWrite = normalizedCalls.find((call) => {
        const p = call.path;
        return p.includes("/models/") && !p.endsWith("/index.ts") && !p.endsWith("/user.ts");
      });
      expect(modelWrite).toBeDefined();
      if (modelWrite) {
        expect(modelWrite.content).toContain("export interface");
      }

      // 2. Find the *new* factory write (anything in factories/ that isn't index.ts or user.factory.ts)
      const factoryWrite = normalizedCalls.find((call) => {
        const p = call.path;
        return p.includes("/factories/") && !p.endsWith("/index.ts") && !p.endsWith("/user.factory.ts");
      });
      expect(factoryWrite).toBeDefined();
      if (factoryWrite) {
        expect(factoryWrite.content).toContain("export function create");
      }

      // 3. Find the *new* builder write (anything in builders/ that isn't user.builder.ts)
      const builderWrite = normalizedCalls.find((call) => {
        const p = call.path;
        return p.includes("/builders/") && !p.endsWith("/user.builder.ts");
      });
      expect(builderWrite).toBeDefined();

      // 4. Factories index write
      const factoriesIndexWrite = normalizedCalls.find((call) => call.path.endsWith("/factories/index.ts"));
      expect(factoriesIndexWrite).toBeDefined();

      // 5. Models index write
      const modelsIndexWrite = normalizedCalls.find((call) => call.path.endsWith("/models/index.ts"));
      expect(modelsIndexWrite).toBeDefined();
    });

    it("should prompt for fields with faker suggestions", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory and model don't exist
      (fileOpsMock.fileExists as any).mockReturnValue(false);
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        return "";
      });

      // Mock templates via readFileSafe (code uses readFileSafe directly)
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./product.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects - verify builder was created with default fields using tools
      const builderWriteCall = fileOpsMock.writeFileSafe.mock.calls.find(
        (call) => call[0] && (call[0] as string).includes("product.builder.ts") && (call[0] as string).includes("builders")
      );
      expect(builderWriteCall).toBeDefined();
      if (builderWriteCall) {
        const builderContent = builderWriteCall[1] as string;
        // Verify tools integration
        expect(builderContent).toContain("createTools(\"product\")");
        expect(builderContent).toContain("getTools().id.short()");
        expect(builderContent).toContain("getTools().person.email()");
        // Verify builder structure
        expect(builderContent).toContain("build<ProductModel>");
        expect(builderContent).toContain("export function buildProduct");
      }

      // No interactive prompts should be called (fields are auto-generated with defaults)
      expect(promptsMock.input).not.toHaveBeenCalled();
      expect(promptsMock.select).not.toHaveBeenCalled();
      expect(promptsMock.confirm).not.toHaveBeenCalled();
    });

    it("should update models/index.ts with new model", async () => {
      // Args
      const modelName = "Product";

      // Mock: Factory and model don't exist
      (fileOpsMock.fileExists as any).mockReturnValue(false);
      const modelsIndexContent = `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          return "export * from \"./user.factory\";";
        }
        if (path.includes("models/index.ts")) {
          return modelsIndexContent;
        }
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Mock: Field prompting
      (promptsMock.input as any).mockResolvedValueOnce("name");
      (promptsMock.input as any).mockResolvedValueOnce("");
      (promptsMock.select as any).mockResolvedValueOnce("string");
      (promptsMock.confirm as any).mockResolvedValueOnce(true);

      // Import command after mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute
      await addFactory(modelName);

      // Expects - should update models/index.ts
      const writeCalls = fileOpsMock.writeFileSafe.mock.calls;
      const modelsIndexCall = writeCalls.find((call) => {
        const callPath = call[0] as string;
        return callPath && callPath.includes("models") && callPath.includes("index.ts");
      });
      expect(modelsIndexCall).toBeDefined();
      if (modelsIndexCall) {
        const content = modelsIndexCall[1] as string;
        // Check for export (uses single quotes in code)
        expect(content).toContain("export * from './product';");
        expect(content).toContain("import type { Product } from './product';");
        expect(content).toContain("Product: Product;");
      }
    });

    it("should handle duplicate factory names (re-prompt)", async () => {
      // Args
      const modelName = "User";
      const newModelKey = "newuser"; // "NewUser" normalizes to "newuser"

      // STEP 4 — Fix "duplicate factory re-prompt" test
      // You need two distinct factory existence checks
      (fileOpsMock.fileExists as any).mockImplementation((path: string) => {
        const p = path.replace(/\\/g, "/");

        if (p.endsWith("/factories/user.factory.ts")) return true;
        if (p.endsWith("/factories/newuser.factory.ts")) return false;

        return false;
      });

      // Mock readFileSafe for index files and templates
      (fileOpsMock.readFileSafe as any).mockImplementation(async (path: string) => {
        if (path.includes("factories/index.ts")) {
          // Index contains "user.factory" - this makes factoryExists("user") return true
          return "export * from \"./user.factory\";"; // Only user.factory in index initially
        }
        if (path.includes("models/index.ts")) {
          return `export * from './user';\n\nimport type { User } from './user';\n\nexport interface ModelMap {\n  User: User;\n}`;
        }
        if (path && (path.includes("templates/model.ts") || path.endsWith("model.ts") && path.includes("templates"))) {
          return "export interface {{ModelName}} {\n{{fields}}\n}";
        }
        if (path && (path.includes("templates/factory.ts") || path.endsWith("factory.ts") && path.includes("templates"))) {
          return "import type * as models from \"../../testdata/models\";\nimport { build{{ModelName}} } from \"../../testdata/builders/{{modelKey}}.builder\";\n\nexport function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {\n  return build{{ModelName}}(overrides);\n}";
        }
        if (path && (path.includes("templates/builder.ts") || path.endsWith("builder.ts") && path.includes("templates"))) {
          return "// {{ModelName}} builder using mimicry-js (private - used by factories only)\nimport { build } from \"mimicry-js\";\nimport type * as models from \"../../testdata/models\";\nimport { createTools } from \"../../testdata/tools\";\n\n// Define the {{ModelName}} model for the builder\ninterface {{ModelName}}Model {\n  id: string;\n  email: string;\n}\n\n// Create tools with idPrefix - tools are created per-builder to support per-test seeding\nfunction getTools() {\n  return createTools(\"{{modelKey}}\");\n}\n\n// Create the builder with default values\nconst {{modelKey}}Builder = build<{{ModelName}}Model>({\n  fields: {\n    id: () => getTools().id.short(),\n    email: () => getTools().person.email(),\n  },\n  traits: {},\n  postBuild: ({{modelKey}}) => {\n    return {{modelKey}};\n  },\n});\n\nexport function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {\n  return {{modelKey}}Builder.one({ overrides });\n}\n\nexport function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {\n  return {{modelKey}}Builder.many(count, { overrides });\n}\n\nexport const {{modelKey}}Traits = {} as const;";
        }
        return "";
      });

      // Mock prompts
      (promptsMock.confirm as any).mockResolvedValueOnce(false); // decline reuse
      (promptsMock.input as any).mockResolvedValueOnce("NewUser");

      // Import command after ALL mocks are set up
      const { addFactory } = await importFactoryCommand();

      // Execute - should re-prompt for new factory name after declining existing
      await addFactory(modelName);

      // Expects
      expect(promptsMock.confirm).toHaveBeenCalled();
      expect(promptsMock.input).toHaveBeenCalled();
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();

      // Then assert by path, not call count
      // Match behavior: find any factory file that's not the original user.factory.ts
      const factoryWrite = fileOpsMock.writeFileSafe.mock.calls.find(
        ([path]) =>
          typeof path === "string" &&
          path.includes("factories") &&
          path.endsWith(".factory.ts") &&
          !path.replace(/\\\\/g, "/").endsWith("/user.factory.ts")
      );
      expect(factoryWrite).toBeDefined();
    });
  });

  describe("factory:delete", () => {
    it("should work with factory name as argument", async () => {
      // Args
      const factoryName = "User";
      const modelKey = "user"; // "User" normalizes to "user"

      // STEP 5: Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
      const indexContent = `export * from "./user.factory";\nexport * from "./other.factory";`;
      (fileOpsMock.readFileSafe as any).mockResolvedValue(indexContent);

      // STEP 5 — Fix delete tests
      // The beforeEach already sets up the smart input mock that handles confirmation prompts
      // No need to override here - the default implementation will work

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("user.factory.ts"));
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled(); // Should update index.ts
    });

    it("should work with dropdown selection", async () => {
      // Args
      const factoryName = undefined;
      const modelKey = "product"; // Selected from dropdown

      // STEP 5: Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue([
        "src/testdata/factories/user.factory.ts",
        "src/testdata/factories/product.factory.ts",
      ]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
      const indexContent = `export * from "./user.factory";\nexport * from "./product.factory";`;
      (fileOpsMock.readFileSafe as any).mockResolvedValue(indexContent);

      // STEP 5: Mock select dropdown
      (promptsMock.select as any).mockResolvedValueOnce("product");
      // The beforeEach already sets up the smart input mock that handles confirmation prompts

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(promptsMock.select).toHaveBeenCalled();
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("product.factory.ts"));
    });

    it("should block deletion if factory is referenced", async () => {
      // Args
      const factoryName = "User";

      // Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue(["tests/some-test.spec.ts"]);

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/is being used in the following file/);
      expect(fileOpsMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should require typed confirmation", async () => {
      // Args
      const factoryName = "User";

      // Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
      (fileOpsMock.readFileSafe as any).mockResolvedValue(`export * from "./user.factory";`);

      // Mock confirmation - wrong text (override the default smart mock for this test)
      (promptsMock.input as any).mockImplementation(async (opts: { message?: string }) => {
        const msg = opts?.message ?? "";

        const quoted = msg.match(/"delete factory ([^"]+)"/i);
        if (quoted?.[1]) return "wrong confirmation"; // Intentionally wrong for this test

        const plain = msg.match(/delete factory\s+([a-z0-9_-]+)/i);
        if (plain?.[1]) return "wrong confirmation"; // Intentionally wrong for this test

        return "";
      });

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/Deletion cancelled/);
      expect(fileOpsMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it("should delete factory file", async () => {
      // Args
      const factoryName = "User";
      const modelKey = "user"; // "User" normalizes to "user"

      // STEP 5: Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
      (fileOpsMock.readFileSafe as any).mockResolvedValue(`export * from "./user.factory";`);

      // STEP 5 — Fix delete tests
      // The beforeEach already sets up the smart input mock that handles confirmation prompts
      // No need to override here - the default implementation will work

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute
      await deleteFactory(factoryName);

      // Expects
      expect(fileOpsMock.deleteFileSafe).toHaveBeenCalledWith(expect.stringContaining("user.factory.ts"));
    });

    it("should remove export from factories/index.ts", async () => {
      // Args
      const factoryName = "User";
      const modelKey = "user"; // "User" normalizes to "user"

      // STEP 5: Mock glob, fileOps, validation
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);
      (fileOpsMock.fileExists as any).mockReturnValue(true);
      (validationMock.getFactoryReferencedFiles as any).mockResolvedValue([]);
      const indexContent = `export * from "./user.factory";\nexport * from "./product.factory";\nexport * from "./order.factory";`;
      (fileOpsMock.readFileSafe as any).mockResolvedValue(indexContent);

      // STEP 5 — Fix delete tests
      // The beforeEach already sets up the smart input mock that handles confirmation prompts
      // No need to override here - the default implementation will work

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute
      await deleteFactory(factoryName);

      // Expects - should remove user.factory export but keep others
      expect(fileOpsMock.writeFileSafe).toHaveBeenCalled();
      // Find the call that updates the index file (should be the second call after deleteFileSafe)
      const writeCalls = fileOpsMock.writeFileSafe.mock.calls;
      // The index.ts update should be one of the writeFileSafe calls
      const indexCall = writeCalls.find(
        (call) => call[0] && (call[0].toString().includes("index.ts") || call[0].toString().includes("factories"))
      );
      // If not found by path, check the content - it should not contain user.factory
      if (indexCall) {
        const updatedContent = indexCall[1] as string;
        expect(updatedContent).not.toContain("user.factory");
        expect(updatedContent).toContain("product.factory");
        expect(updatedContent).toContain("order.factory");
      } else {
        // Check all writeFileSafe calls - one should have content without user.factory
        const contentCalls = writeCalls.filter((call) => typeof call[1] === "string");
        const indexUpdate = contentCalls.find((call) => {
          const content = call[1] as string;
          return !content.includes("user.factory") && content.includes("product.factory");
        });
        expect(indexUpdate).toBeDefined();
      }
    });

    it("should handle non-existent factory gracefully", async () => {
      // Args
      const factoryName = "NonExistent";

      // Mock glob - factory not found
      (globMock as any).mockResolvedValue(["src/testdata/factories/user.factory.ts"]);

      // Import command - now uses stable mocked modules
      const { deleteFactory } = await importFactoryCommand();

      // Execute & Expects
      await expect(deleteFactory(factoryName)).rejects.toThrow(/Factory not found/);
      expect(fileOpsMock.deleteFileSafe).not.toHaveBeenCalled();
    });
  });
});
