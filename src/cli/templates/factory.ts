import type * as models from "../../testdata/models";
import { build{{ModelName}} } from "../../testdata/builders/{{modelKey}}.builder";

export function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {
  return build{{ModelName}}(overrides);
}
