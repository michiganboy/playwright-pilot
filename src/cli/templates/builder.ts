// {{ModelName}} builder using mimicry-js (private - used by factories only)
import { build } from "mimicry-js";
import type * as models from "../../testdata/models";
import { createTools } from "../../testdata/tools";

// Define the {{ModelName}} model for the builder
interface {{ModelName}}Model {
  id: string;
  email: string;
  // Add other fields here
}

// Create tools with idPrefix - tools are created per-builder to support per-test seeding
function getTools() {
  return createTools("{{modelKey}}");
}

// Create the builder with default values
const {{modelKey}}Builder = build<{{ModelName}}Model>({
  fields: {
    id: () => getTools().id.short(),
    email: () => getTools().person.email(),
    // Add other field generators using tools
  },
  traits: {
    // Define traits (optional variations) here
    // Example:
    // admin: {
    //   overrides: {
    //     email: () => "admin@example.com",
    //   },
    // },
  },
  // Optional post-build hook for derived consistency
  postBuild: ({{modelKey}}) => {
    // Example: ensure derived fields are consistent
    // This is optional and can be customized per model
    return {{modelKey}};
  },
});

// Export builder methods for factory use
export function build{{ModelName}}(overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}} {
  return {{modelKey}}Builder.one({ overrides });
}

export function build{{ModelName}}s(count: number, overrides?: Partial<{{ModelName}}Model>): models.{{ModelName}}[] {
  return {{modelKey}}Builder.many(count, { overrides });
}

// Export traits for factory use (if any)
export const {{modelKey}}Traits = {
  // Example: admin: "admin" as const,
} as const;
