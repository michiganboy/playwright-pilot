import type * as models from "../../testdata/models";

export function createSchedule(overrides?: Partial<models.Schedule>) {
  const schedule: models.Schedule = {
    ...overrides,
  } as models.Schedule;

  return schedule;
}