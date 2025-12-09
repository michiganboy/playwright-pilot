// Tests test utility functions including factories and data store.
import { expect, test } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";
import { load } from "../../src/utils/dataStore";

test.describe.serial("UTIL-001 - Test Utilities @utilities", () => {
    test("[999] Verify factories and data store functionality", async () => {
        // 1. Create and save test data using factories
        await test.step("Create and save test data using factories", async () => {
            const enrollmentUser = factories.createUser();
            await enrollmentUser.save("enrollment.user");
            console.log("Created and saved enrollment user:", JSON.stringify(enrollmentUser, null, 2));

            const appointmentsUser = factories.createUser();
            await appointmentsUser.save("appointments.user");
            console.log("Created and saved appointments user:", JSON.stringify(appointmentsUser, null, 2));

            const siteManagerUser = factories.createUser();
            await siteManagerUser.save("sitemanager.user");
            console.log("Created and saved site manager user:", JSON.stringify(siteManagerUser, null, 2));

            const appointment = factories.createAppointment();
            console.log("Created appointment (factory test only):", JSON.stringify(appointment, null, 2));
        });

        // 2. Retrieve and verify saved data
        await test.step("Retrieve and verify saved data from data store", async () => {
            const enrollmentUser = await load("enrollment.user");
            console.log("Retrieved enrollment user from data store:", JSON.stringify(enrollmentUser, null, 2));
            expect(enrollmentUser).toBeDefined();
            expect(enrollmentUser?.firstName).toBeDefined();
            expect(enrollmentUser?.lastName).toBeDefined();
            expect(enrollmentUser?.email).toBeDefined();
            expect(enrollmentUser?.phone).toBeDefined();

            const appointmentsUser = await load("appointments.user");
            console.log("Retrieved appointments user from data store:", JSON.stringify(appointmentsUser, null, 2));
            expect(appointmentsUser).toBeDefined();
            expect(appointmentsUser?.firstName).toBeDefined();
            expect(appointmentsUser?.lastName).toBeDefined();
            expect(appointmentsUser?.email).toBeDefined();
            expect(appointmentsUser?.phone).toBeDefined();

            const siteManagerUser = await load("sitemanager.user");
            console.log("Retrieved site manager user from data store:", JSON.stringify(siteManagerUser, null, 2));
            expect(siteManagerUser).toBeDefined();
            expect(siteManagerUser?.firstName).toBeDefined();
            expect(siteManagerUser?.lastName).toBeDefined();
            expect(siteManagerUser?.email).toBeDefined();
            expect(siteManagerUser?.phone).toBeDefined();
        });
    });
});
