export * from './user';
export * from './schedule';

import type { User } from './user';
import type { Schedule } from './schedule';

export interface ModelMap {
  User: User;
  Schedule: Schedule;
}
