import { faker } from "@faker-js/faker";
import type * as models from "../models";
import { save } from "../../utils/dataStore";
import type { DataStoreMap } from "../../utils/dataStore";

export function createAppointment(overrides?: Partial<models.Appointment>) {
  const startTime = faker.date.future();
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  const appointment: models.Appointment = {
    id: faker.string.uuid(),
    startTime,
    endTime,
    agent: faker.person.fullName(),
    location: faker.location.city(),
    type: faker.helpers.arrayElement(["virtual", "in-person"]),
    ...overrides,
  };

  return {
    ...appointment,
    async save<K extends keyof DataStoreMap>(key: K): Promise<models.Appointment> {
      await save(key, appointment as DataStoreMap[K]);
      return appointment;
    },
  };
}
