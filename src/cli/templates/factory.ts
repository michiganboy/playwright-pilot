import { faker } from "@faker-js/faker";
import type * as models from "../models";
import { save } from "../../utils/dataStore";
import type { DataStoreMap } from "../../utils/dataStore";

export function create{{ModelName}}(overrides?: Partial<models.{{ModelName}}>) {
  const {{modelKey}}: models.{{ModelName}} = {
    // TODO: Add your model fields here with faker data
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    ...overrides,
  };

  return {
    ...{{modelKey}},
    async save<K extends keyof DataStoreMap>(key: K): Promise<models.{{ModelName}}> {
      await save(key, {{modelKey}} as unknown as DataStoreMap[K]);
      return {{modelKey}};
    },
  };
}
