export interface Appointment {
  id: string;
  startTime: Date;
  endTime: Date;
  agent: string;
  location: string;
  type: "virtual" | "in-person";
}
