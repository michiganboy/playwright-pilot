export * from './user';
export * from './appointment';

import type { User } from './user';
import type { Appointment } from './appointment';

export interface ModelMap {
  User: User;
  Appointment: Appointment;
}
