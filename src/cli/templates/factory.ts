import type * as models from "../../testdata/models";

export function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {
  const {{modelKey}}: models.{{ModelName}} = {
    ...overrides,
  } as models.{{ModelName}};

  return {{modelKey}};
}