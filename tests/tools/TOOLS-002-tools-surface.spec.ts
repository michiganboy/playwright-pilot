import { test, expect } from "../fixtures/test-fixtures";
import { createTools } from "../../src/testdata/tools";
import { build } from "mimicry-js";

// ---
// Tests for Tools Surface Coverage
// Feature: tools
// Tag: @tools
// ADO Plan ID: (not applicable - validation test)
// ADO Suite IDs: (not applicable - validation test)
// ---

test.describe("TOOLS-002 - Tools Surface Coverage @tools", () => {
  test("pick API", async () => {
    const tools = createTools("tools_test");

    // Test pick.one()
    const items = ["apple", "banana", "cherry"];
    const pickedOne = tools.pick.one(items);
    expect(items).toContain(pickedOne);
    expect(pickedOne).toBeDefined();

    // Test pick.many()
    const pickedMany = tools.pick.many(items, 2);
    expect(pickedMany.length).toBe(2);
    pickedMany.forEach((item) => {
      expect(items).toContain(item);
    });
    // Ensure no duplicates (if count <= array length)
    const uniquePicked = Array.from(new Set(pickedMany));
    expect(uniquePicked.length).toBe(pickedMany.length);

    // Test pick.weighted()
    const weightedItems = [
      { item: "low", weight: 5 },
      { item: "medium", weight: 3 },
      { item: "high", weight: 1 },
    ];
    const pickedWeighted = tools.pick.weighted(weightedItems);
    expect(["low", "medium", "high"]).toContain(pickedWeighted);
    expect(pickedWeighted).toBeDefined();

    // Test pick.enum()
    const StatusEnum = {
      Active: "active" as const,
      Inactive: "inactive" as const,
      Pending: "pending" as const,
    };
    const pickedEnum = tools.pick.enum(StatusEnum);
    expect(["active", "inactive", "pending"]).toContain(pickedEnum);

    console.log("[TOOLS-002] pick:", {
      one: pickedOne,
      many: pickedMany,
      weighted: pickedWeighted,
      enum: pickedEnum,
    });
  });

  test("person API", async () => {
    const tools = createTools("tools_test");

    // Generate person data
    const email = tools.person.email();
    const phone = tools.person.phone();
    const firstName = tools.person.firstName();
    const lastName = tools.person.lastName();
    const fullName = tools.person.fullName();
    const streetAddress = tools.person.streetAddress();
    const city = tools.person.city();
    const state = tools.person.state();
    const zipCode = tools.person.zipCode();
    const address = tools.person.address();

    // Assert email
    expect(typeof email).toBe("string");
    expect(email.length).toBeGreaterThan(0);
    expect(email).toContain("@");

    // Assert phone
    expect(typeof phone).toBe("string");
    expect(phone.length).toBeGreaterThan(0);
    expect(phone).toMatch(/\(\d{3}\) \d{3}-\d{4}/);

    // Assert names
    expect(typeof firstName).toBe("string");
    expect(firstName.length).toBeGreaterThan(0);
    expect(typeof lastName).toBe("string");
    expect(lastName.length).toBeGreaterThan(0);
    expect(typeof fullName).toBe("string");
    expect(fullName.length).toBeGreaterThan(0);
    // fullName is generated independently, so it may not match the separately generated firstName/lastName
    // Just verify it has the expected format (contains a space, indicating first and last name)
    expect(fullName).toMatch(/\w+ \w+/);

    // Assert address components
    expect(typeof streetAddress).toBe("string");
    expect(streetAddress.length).toBeGreaterThan(0);
    expect(typeof city).toBe("string");
    expect(city.length).toBeGreaterThan(0);
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);
    expect(typeof zipCode).toBe("string");
    expect(zipCode.length).toBeGreaterThan(0);
    expect(zipCode).toMatch(/^\d{5}$/);

    // Assert address string
    expect(typeof address).toBe("string");
    expect(address.length).toBeGreaterThan(0);

    console.log("[TOOLS-002] person:", JSON.stringify(
      {
        email,
        phone,
        firstName,
        lastName,
        fullName,
        streetAddress,
        city,
        state,
        zipCode,
        address,
      },
      null,
      2
    ));
  });

  test("date API", async () => {
    const tools = createTools("tools_test");

    // Test today()
    const today = tools.date.today();
    expect(today).toBeInstanceOf(Date);
    expect(today.getTime()).toBeLessThanOrEqual(Date.now());

    // Test addDays()
    const futureDate = tools.date.addDays(today, 7);
    expect(futureDate).toBeInstanceOf(Date);
    expect(futureDate.getTime()).toBeGreaterThan(today.getTime());
    const diffDays = Math.floor((futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);

    // Test nextBusinessDay()
    const nextBusiness = tools.date.nextBusinessDay(today);
    expect(nextBusiness).toBeInstanceOf(Date);
    const dayOfWeek = nextBusiness.getDay();
    expect(dayOfWeek).toBeGreaterThanOrEqual(1); // Monday
    expect(dayOfWeek).toBeLessThanOrEqual(5); // Friday

    // Test range()
    const start = new Date("2024-01-01");
    const end = new Date("2024-12-31");
    const rangeDate = tools.date.range(start, end);
    expect(rangeDate).toBeInstanceOf(Date);
    expect(rangeDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(rangeDate.getTime()).toBeLessThanOrEqual(end.getTime());

    // Test appointmentSlot()
    const baseDate = new Date("2024-03-15");
    const slot = tools.date.appointmentSlot(baseDate, 14, 30);
    expect(slot).toBeInstanceOf(Date);
    expect(slot.getHours()).toBe(14);
    expect(slot.getMinutes()).toBe(30);
    expect(slot.getSeconds()).toBe(0);
    expect(slot.getMilliseconds()).toBe(0);

    console.log("[TOOLS-002] date:", {
      today: today.toISOString(),
      futureDate: futureDate.toISOString(),
      nextBusiness: nextBusiness.toISOString(),
      rangeDate: rangeDate.toISOString(),
      slot: slot.toISOString(),
    });
  });

  test("id API", async () => {
    const tools = createTools("tools_test");

    // Test uuid()
    const uuid = tools.id.uuid();
    expect(typeof uuid).toBe("string");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidPattern);

    // Test numeric()
    const numeric = tools.id.numeric(1, 100);
    expect(typeof numeric).toBe("number");
    expect(numeric).toBeGreaterThanOrEqual(1);
    expect(numeric).toBeLessThanOrEqual(100);

    // Test short() with idPrefix
    const shortId = tools.id.short();
    expect(typeof shortId).toBe("string");
    expect(shortId.length).toBeGreaterThan(0);
    expect(shortId).toContain("_");
    // Should start with "tools_test_" prefix
    expect(shortId).toMatch(/^tools_test_/);

    // Test short() with custom prefix
    const customShort = tools.id.short("custom");
    expect(typeof customShort).toBe("string");
    expect(customShort).toMatch(/^custom_/);

    console.log("[TOOLS-002] id:", {
      uuid,
      numeric,
      shortId,
      customShort,
    });
  });

  test("str API", async () => {
    const tools = createTools("tools_test");

    // Test slug()
    const slug = tools.str.slug("Hello World");
    expect(typeof slug).toBe("string");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toContain(" ");
    expect(slug).toContain("hello");
    expect(slug).toContain("world");

    // Test title()
    const title = tools.str.title("hello world");
    expect(typeof title).toBe("string");
    expect(title).toBe("Hello World");
    expect(title).not.toBe("hello world");

    // Test randomAlphaNumeric()
    const random = tools.str.randomAlphaNumeric(10);
    expect(typeof random).toBe("string");
    expect(random.length).toBe(10);
    expect(random).toMatch(/^[A-Za-z0-9]+$/);

    // Test mask()
    const masked = tools.str.mask("secret123", 4);
    expect(typeof masked).toBe("string");
    expect(masked.length).toBe("secret123".length);
    expect(masked).toMatch(/^secr\*+$/);
    expect(masked.slice(0, 4)).toBe("secr");
    expect(masked.slice(4)).toBe("*****");

    console.log("[TOOLS-002] str:", {
      slug,
      title,
      random,
      masked,
    });
  });

  test("override API", async () => {
    const tools = createTools("tools_test");

    // Test override.merge()
    const base = { id: "1", name: "User", role: "member", nested: { value: 10 } };
    const overrides = { role: "admin", nested: { value: 20 } };
    const merged = tools.override.merge(base, overrides);
    expect(merged.id).toBe("1");
    expect(merged.name).toBe("User");
    expect(merged.role).toBe("admin"); // Override wins
    // Note: merge is shallow, so nested.value might be replaced entirely
    expect(merged.nested).toBeDefined();

    // Test override.pick()
    const obj = { id: "1", email: "test@example.com", role: "member" };
    const picked = tools.override.pick(obj, "email", () => "new@example.com");
    expect(picked.id).toBe("1");
    expect(picked.role).toBe("member");
    expect(picked.email).toBe("new@example.com");

    console.log("[TOOLS-002] override:", {
      merged,
      picked,
    });
  });

  test("after.build API (post-build hook)", async () => {
    const tools = createTools("tools_test");

    // Define a test model interface
    interface TestModel {
      firstName: string;
      lastName: string;
      fullName: string;
    }

    // Create a builder using mimicry-js with tools.after.build
    const testBuilder = build<TestModel>({
      fields: {
        firstName: () => tools.person.firstName(),
        lastName: () => tools.person.lastName(),
        fullName: () => "", // Will be set in postBuild
      },
      postBuild: tools.after.build((obj) => {
        obj.fullName = `${obj.firstName} ${obj.lastName}`;
        return obj;
      }),
    });

    // Build an object
    const result = testBuilder.one();

    // Assert postBuild hook ran and derived fullName
    expect(result).toHaveProperty("firstName");
    expect(result).toHaveProperty("lastName");
    expect(result).toHaveProperty("fullName");
    expect(result.fullName).toBe(`${result.firstName} ${result.lastName}`);
    expect(result.fullName.length).toBeGreaterThan(0);

    console.log("[TOOLS-002] after.build:", JSON.stringify(result, null, 2));
  });
});
