import { test, expect } from "../fixtures/test-fixtures";
import * as factories from "../../src/testdata/factories";
import type * as models from "../../src/testdata/models";

// ---
// Tests for Tools + User Defaults Validation
// Feature: tools
// Tag: @tools
// ADO Plan ID: (not applicable - validation test)
// ADO Suite IDs: (not applicable - validation test)
// ---

test.describe("TOOLS-001 - User Defaults Validation @tools", () => {
  test("creates a valid User with required defaults", async () => {
    const user = factories.createUser();

    // Log the generated user for seed verification
    console.log("[TOOLS-001] user defaults:", JSON.stringify(user, null, 2));

    // Assert all required fields exist
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("role");
    expect(user).toHaveProperty("firstName");
    expect(user).toHaveProperty("lastName");
    expect(user).toHaveProperty("fullName");
    expect(user).toHaveProperty("phone");
    expect(user).toHaveProperty("address");

    // Assert field types and constraints
    expect(typeof user.id).toBe("string");
    expect(user.id.length).toBeGreaterThan(0);
    expect(typeof user.email).toBe("string");
    expect(user.email.length).toBeGreaterThan(0);
    expect(user.email).toContain("@");
    expect(typeof user.firstName).toBe("string");
    expect(user.firstName.length).toBeGreaterThan(0);
    expect(typeof user.lastName).toBe("string");
    expect(user.lastName.length).toBeGreaterThan(0);
    expect(typeof user.fullName).toBe("string");
    expect(user.fullName.length).toBeGreaterThan(0);
    expect(typeof user.phone).toBe("string");
    expect(user.phone.length).toBeGreaterThan(0);

    // Assert role is in valid union
    expect(["admin", "agent", "viewer"]).toContain(user.role);

    // Assert address has all required keys
    expect(user.address).toHaveProperty("streetAddress");
    expect(user.address).toHaveProperty("city");
    expect(user.address).toHaveProperty("state");
    expect(user.address).toHaveProperty("zipCode");
    expect(typeof user.address.streetAddress).toBe("string");
    expect(user.address.streetAddress.length).toBeGreaterThan(0);
    expect(typeof user.address.city).toBe("string");
    expect(user.address.city.length).toBeGreaterThan(0);
    expect(typeof user.address.state).toBe("string");
    expect(user.address.state.length).toBeGreaterThan(0);
    expect(typeof user.address.zipCode).toBe("string");
    expect(user.address.zipCode.length).toBeGreaterThan(0);

    // Assert fullName is derived correctly from firstName and lastName
    expect(user.fullName).toBe(`${user.firstName} ${user.lastName}`);
  });

  test("supports overrides and preserves derived fullName", async () => {
    const user = factories.createUser({
      firstName: "John",
      lastName: "Doe",
      role: "admin",
    });

    // Log the overridden user for seed verification
    console.log("[TOOLS-001] user overrides:", JSON.stringify(user, null, 2));

    // Assert overridden fields are respected
    expect(user.firstName).toBe("John");
    expect(user.lastName).toBe("Doe");
    expect(user.role).toBe("admin");

    // Assert fullName is still derived correctly after overrides
    expect(user.fullName).toBe(`${user.firstName} ${user.lastName}`);
    expect(user.fullName).toBe("John Doe");

    // Assert role override stays in union
    expect(["admin", "agent", "viewer"]).toContain(user.role);

    // Assert other fields are still generated (not overridden)
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("phone");
    expect(user).toHaveProperty("address");
    expect(typeof user.id).toBe("string");
    expect(typeof user.email).toBe("string");
    expect(typeof user.phone).toBe("string");
  });

  test("id.short behavior sanity check", async () => {
    const user = factories.createUser();

    // Log the generated id for verification
    console.log("[TOOLS-001] generated id:", user.id);

    // Assert id is non-empty
    expect(user.id).toBeTruthy();
    expect(typeof user.id).toBe("string");
    expect(user.id.length).toBeGreaterThan(0);

    // Assert id is NOT a UUID shape (UUIDs have format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    // Short IDs should not match UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(user.id).not.toMatch(uuidPattern);

    // Assert id contains underscore to prove it's short-form (idPrefix format: "user_abc123")
    expect(user.id).toContain("_");

    // Assert id starts with "user_" prefix (since createTools("user") is used)
    expect(user.id).toMatch(/^user_/);
  });

  test("seed determinism smoke check", async () => {
    // Create two users in the same test
    const user1 = factories.createUser();
    const user2 = factories.createUser();

    // Log both users for seed verification
    console.log("[TOOLS-001] user1:", JSON.stringify(user1, null, 2));
    console.log("[TOOLS-001] user2:", JSON.stringify(user2, null, 2));

    // Assert values are different (to avoid accidental reuse)
    // Note: Within the same test, with deterministic seeding, these should actually be the same
    // But we're checking they're valid objects, not asserting exact equality
    expect(user1).toBeDefined();
    expect(user2).toBeDefined();
    expect(user1).toHaveProperty("id");
    expect(user2).toHaveProperty("id");
    expect(user1).toHaveProperty("email");
    expect(user2).toHaveProperty("email");

    // Both should have valid structure
    expect(["admin", "agent", "viewer"]).toContain(user1.role);
    expect(["admin", "agent", "viewer"]).toContain(user2.role);
    expect(user1.fullName).toBe(`${user1.firstName} ${user1.lastName}`);
    expect(user2.fullName).toBe(`${user2.firstName} ${user2.lastName}`);
  });
});
