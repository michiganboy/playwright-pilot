import { faker } from "@faker-js/faker";
import type * as models from "../models";
import { save } from "../../utils/dataStore";
import type { DataStoreMap } from "../../utils/dataStore";

export function createUser(overrides?: Partial<models.User>) {
  const user: models.User = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    ...overrides,
  };

  return {
    ...user,
    async save<K extends keyof DataStoreMap>(key: K): Promise<models.User> {
      await save(key, user as DataStoreMap[K]);
      return user;
    },
  };
}
