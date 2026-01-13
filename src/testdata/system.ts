// System registry: canonical system.* keys for repo-backed data.
// This is the ONLY place where system.* key strings are defined.
// Tests should not import this directly; system values flow through fixtures.

export const system = {
  salesforce: {
    users: {
      admin: "system.salesforce.users.admin",
      sales: "system.salesforce.users.sales",
      accountManager: "system.salesforce.users.accountManager",
    },
  },
} as const;

type Leaves<T> = T extends string
  ? T
  : { [K in keyof T]: Leaves<T[K]> }[keyof T];

export type SystemKey = Leaves<typeof system>;
