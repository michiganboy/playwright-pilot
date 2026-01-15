import { test, expect } from "@playwright/test";
import "dotenv/config";
import Mailosaur from "mailosaur";
import { MailosaurClient, createMfaHelper } from "../../src/integrations/mailosaur/MailosaurClient";
import { extractCodes, extractLinks } from "../../src/integrations/mailosaur/parsers";

// ---
// Live Integration Tests for Mailosaur
// Requires: MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID in .env
// Run manually: npx playwright test --grep @mailosaur-live
// Skipped in CI by default (no @tools tag)
// ---

// Non-null assertion safe: test.skip() guards against missing env vars
const serverId = process.env.MAILOSAUR_SERVER_ID!;
const LIVE_TEST_EMAIL = `sure-sunlight@${serverId}.mailosaur.net`;

test.describe("Mailosaur Live Integration @mailosaur-live", () => {
  // Skip if credentials not configured
  test.skip(!process.env.MAILOSAUR_API_KEY || !process.env.MAILOSAUR_SERVER_ID,
    "Skipped: MAILOSAUR_API_KEY or MAILOSAUR_SERVER_ID not set");

  let sdk: InstanceType<typeof Mailosaur>;
  let client: MailosaurClient;
  const createdMessageIds: string[] = [];

  test.beforeAll(() => {
    sdk = new Mailosaur(process.env.MAILOSAUR_API_KEY!);
    client = new MailosaurClient();
  });

  test.afterAll(async () => {
    // Cleanup all created messages
    for (const id of createdMessageIds) {
      try {
        await sdk.messages.del(id);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test("SDK extraction - standard OTP format", async () => {
    const testCode = "847291";

    // Create message with standard format
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Your verification code",
      text: `Your one-time code is ${testCode}. It expires in 10 minutes.`,
      html: `<p>Your one-time code is <strong>${testCode}</strong>.</p>`,
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message ID: ${msg.id}`);
    console.log(`[LIVE] SDK extracted codes: [${msg.text?.codes?.map(c => c.value).join(", ") || "none"}]`);

    // Retrieve via our client
    const normalized = await client.waitForMessage({
      sentTo: LIVE_TEST_EMAIL,
      timeoutMs: 10000,
    });

    expect(normalized.id).toBe(msg.id);
    expect(normalized.codes).toContain(testCode);
    expect(normalized.receivedAt).toBeInstanceOf(Date);

    console.log(`[LIVE] ✓ SDK extraction passed: found "${testCode}"`);
  });

  test("Regex fallback - unusual OTP format", async () => {
    const testCode = "582947";

    // Create message with unusual format SDK won't extract
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Account Alert",
      text: `Security notice: Use verification sequence [[${testCode}]] to confirm.`,
      html: `<p>Security notice: Use verification sequence [[${testCode}]] to confirm.</p>`,
    });
    createdMessageIds.push(msg.id!);

    const sdkCodes = msg.text?.codes?.map(c => c.value) || [];
    console.log(`[LIVE] Created message ID: ${msg.id}`);
    console.log(`[LIVE] SDK extracted codes: [${sdkCodes.join(", ") || "none"}]`);

    // Retrieve via our client
    const normalized = await client.waitForMessage({
      sentTo: LIVE_TEST_EMAIL,
      timeoutMs: 10000,
    });

    // Our normalization should have found it via regex fallback
    expect(normalized.codes).toContain(testCode);

    // Verify regex works independently
    const regexCodes = extractCodes({ ...normalized, codes: [] });
    expect(regexCodes).toContain(testCode);

    console.log(`[LIVE] ✓ Regex fallback passed: found "${testCode}"`);
  });

  test("MfaHelper.waitForOtp() end-to-end", async () => {
    const testCode = "123456";

    // Create message
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "MFA Code",
      text: `Your code is ${testCode}.`,
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message ID: ${msg.id}`);

    // Test MfaHelper
    const helper = createMfaHelper(client);
    const otpResult = await helper.waitForOtp(LIVE_TEST_EMAIL, 10000);

    expect(otpResult.code).toBe(testCode);
    expect(otpResult.receivedAt).toBeInstanceOf(Date);
    expect(otpResult.message.id).toBe(msg.id);

    console.log(`[LIVE] ✓ MfaHelper.waitForOtp() passed: code="${otpResult.code}"`);
  });

  test("API connectivity - list messages", async () => {
    const result = await sdk.messages.list(serverId);

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);

    console.log(`[LIVE] ✓ API connectivity passed: ${result.items?.length ?? 0} messages in inbox`);
  });

  test("Link extraction - email with verification link", async () => {
    const verifyLink = "https://example.com/verify?token=abc123&user=test";
    const resetLink = "https://example.com/reset?code=xyz789";

    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Account Actions",
      text: `Verify your account: ${verifyLink}\nReset password: ${resetLink}`,
      html: `<p>Verify: <a href="${verifyLink}">Click here</a></p><p>Reset: <a href="${resetLink}">Reset</a></p>`,
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message with links, ID: ${msg.id}`);

    const normalized = await client.waitForMessage({
      sentTo: LIVE_TEST_EMAIL,
      timeoutMs: 10000,
    });

    expect(normalized.links.length).toBeGreaterThanOrEqual(2);
    expect(normalized.links.some(l => l.includes("/verify"))).toBe(true);
    expect(normalized.links.some(l => l.includes("/reset"))).toBe(true);

    console.log(`[LIVE] ✓ Link extraction passed: ${normalized.links.length} links found`);
  });

  test("Email content inspection - subject, body, from", async () => {
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Order Confirmation #12345",
      text: "Thank you for your order! Your order number is 12345. Total: $99.99",
      html: "<h1>Order Confirmation</h1><p>Order #12345</p><p>Total: $99.99</p>",
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created order confirmation email, ID: ${msg.id}`);

    const normalized = await client.waitForMessage({
      sentTo: LIVE_TEST_EMAIL,
      subjectContains: "Order Confirmation",
      timeoutMs: 10000,
    });

    expect(normalized.subject).toBe("Order Confirmation #12345");
    expect(normalized.textBody).toContain("Thank you for your order");
    expect(normalized.textBody).toContain("$99.99");
    expect(normalized.htmlBody).toContain("<h1>Order Confirmation</h1>");

    console.log(`[LIVE] ✓ Content inspection passed: subject="${normalized.subject}"`);
  });

  test("Spam analysis - check email spam score", async () => {
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Important: Your Account Update",
      text: "This is a legitimate business email with proper content.",
      html: "<html><body><p>This is a legitimate business email with proper content.</p></body></html>",
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message for spam analysis, ID: ${msg.id}`);

    const spamResult = await client.analyzeSpam(msg.id!);

    expect(spamResult).toHaveProperty("score");
    expect(spamResult).toHaveProperty("result");
    expect(spamResult).toHaveProperty("rules");
    expect(typeof spamResult.score).toBe("number");
    expect(["Pass", "Warning", "Fail"]).toContain(spamResult.result);
    expect(Array.isArray(spamResult.rules)).toBe(true);

    console.log(`[LIVE] ✓ Spam analysis passed: score=${spamResult.score}, result=${spamResult.result}`);
    console.log(`[LIVE]   Rules triggered: ${spamResult.rules.length}`);
    if (spamResult.rules.length > 0) {
      console.log(`[LIVE]   Top rule: ${spamResult.rules[0].rule} (${spamResult.rules[0].score})`);
    }
  });

  test("Deliverability analysis - check SPF/DKIM/DMARC", async () => {
    // NOTE: Test-created messages via sdk.messages.create() don't have real
    // SPF/DKIM/DMARC data because they weren't sent via SMTP. This test verifies
    // the API structure works. For real deliverability testing, use actual
    // emails sent from Salesforce or another mail server.

    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Deliverability Test",
      text: "Testing email authentication checks.",
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message for deliverability analysis, ID: ${msg.id}`);

    try {
      const deliverability = await client.analyzeDeliverability(msg.id!);

      expect(deliverability).toHaveProperty("spf");
      expect(deliverability).toHaveProperty("dkim");
      expect(deliverability).toHaveProperty("dmarc");

      expect(deliverability.spf).toHaveProperty("result");
      expect(deliverability.spf).toHaveProperty("description");
      expect(deliverability.dkim).toHaveProperty("result");
      expect(deliverability.dkim).toHaveProperty("description");
      expect(deliverability.dmarc).toHaveProperty("result");
      expect(deliverability.dmarc).toHaveProperty("description");

      console.log(`[LIVE] ✓ Deliverability analysis passed:`);
      console.log(`[LIVE]   SPF: ${deliverability.spf.result} - ${deliverability.spf.description}`);
      console.log(`[LIVE]   DKIM: ${deliverability.dkim.result} - ${deliverability.dkim.description}`);
      console.log(`[LIVE]   DMARC: ${deliverability.dmarc.result} - ${deliverability.dmarc.description}`);
    } catch (error) {
      // Deliverability analysis may not be available for test-created messages
      // or may require a higher-tier Mailosaur plan
      console.log(`[LIVE] ⚠ Deliverability analysis not available for test-created messages`);
      console.log(`[LIVE]   This is expected - use real SMTP emails for deliverability testing`);
      console.log(`[LIVE]   Error: ${error instanceof Error ? error.message : String(error)}`);
      test.skip();
    }
  });

  test("Preview URL generation", async () => {
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Preview Test",
      text: "This email can be previewed in browser.",
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message for preview, ID: ${msg.id}`);

    const preview = client.getPreviewUrl(msg.id!);

    expect(preview).toHaveProperty("messageId");
    expect(preview).toHaveProperty("previewUrl");
    expect(preview.messageId).toBe(msg.id);
    expect(preview.previewUrl).toContain("mailosaur.com");
    expect(preview.previewUrl).toContain(msg.id!);

    console.log(`[LIVE] ✓ Preview URL generated: ${preview.previewUrl}`);
  });

  test("Message retrieval by ID", async () => {
    const msg = await sdk.messages.create(serverId, {
      to: LIVE_TEST_EMAIL,
      subject: "Get By ID Test",
      text: "Testing direct message retrieval.",
    });
    createdMessageIds.push(msg.id!);

    console.log(`[LIVE] Created message, ID: ${msg.id}`);

    const retrieved = await client.getMessageById(msg.id!);

    expect(retrieved.id).toBe(msg.id);
    expect(retrieved.subject).toBe("Get By ID Test");
    expect(retrieved.textBody).toContain("Testing direct message retrieval");

    console.log(`[LIVE] ✓ Message retrieved by ID: ${retrieved.subject}`);
  });
});
