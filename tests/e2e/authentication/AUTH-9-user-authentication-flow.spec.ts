// Tests the authentication flow.
import { expect, test } from "../../fixtures/test-fixtures";

test.describe
    .serial("User Authentication Flow @authentication", () => {
        test("[8] Verify user is able to login with valid credentials", async ({
            loginPage,
            dashboardPage,
        }) => {
            // 1. Navigate to login page
            await test.step("Navigate to login page", async () => {
                await loginPage.navigateToLogin();
            });
            // 2. Locate the Email field and enter a valid email address
            await test.step("Locate the Email field and enter a valid email address", async () => {
                const email = process.env.LOGIN_EMAIL;
                if (!email) {
                    throw new Error("LOGIN_EMAIL is not set in the environment variables.");
                }
                await loginPage.fillEmail(email);
            });
            // 3. Locate the Password field and enter a valid password
            await test.step("Locate the Password field and enter a valid password", async () => {
                const password = process.env.LOGIN_PASSWORD;
                if (!password) {
                    throw new Error(
                        "LOGIN_PASSWORD is not set in the environment variables."
                    );
                }
                await loginPage.fillPassword(password);
            });
            // 4. Click the Login button
            await test.step("Click the Login button", async () => {
                await loginPage.submitLogin();
            });
            // 5. Verify the user is logged in
            await test.step("Verify the user is logged in", async () => {
                expect(await dashboardPage.getWelcomeMessage()).toEqual(`Welcome back, ${process.env.LOGIN_EMAIL}`);
            });
        });
        test("[10] Verify user is not able to login with invalid credentials", async ({
            loginPage,
        }) => {
            // 1. Navigate to login page
            await test.step("Navigate to login page", async () => {
                await loginPage.navigateToLogin();
            });
            // 2. Locate the Email field and enter an invalid email address
            await test.step("Locate the Email field and enter an invalid email address", async () => {
                await loginPage.fillEmail("invalid@example.com");
            });
            // 3. Locate the Password field and enter an invalid password
            await test.step("Locate the Password field and enter an invalid password", async () => {
                await loginPage.fillPassword("invalidpassword");
            });
            // 4. Click the Login button
            await test.step("Click the Login button", async () => {
                await loginPage.submitLogin();
            });
            // 5. Verify the user is not logged in
            await test.step("Verify the user is not logged in", async () => {
                expect(await loginPage.getErrorMessage()).toEqual("Invalid login credentials");
            });
        });
    });
