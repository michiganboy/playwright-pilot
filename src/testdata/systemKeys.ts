// Defines the supported system.* keys for the JSON data store.
export const systemKeys = {
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

// System data store keys as a union type.
export type SystemKey = Leaves<typeof systemKeys>;
