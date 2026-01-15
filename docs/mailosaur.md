# Mailosaur Integration

Mailosaur provides email and SMS testing capabilities for automated MFA flows, email content validation, spam analysis, and deliverability testing. This integration is **invisible by default** for MFA - test authors simply log in with MFA users and the framework handles OTP retrieval automatically.

## Overview

**Core Capabilities:**

- **MFA Automation** - Invisible OTP handling for login flows
- **Email Content Validation** - Verify Salesforce emails are sent with correct content
- **Link Extraction** - Get verification/reset links from emails
- **Attachment Handling** - Download and inspect email attachments
- **Spam Analysis** - Check if emails will land in spam folders
- **Deliverability Testing** - Verify SPF/DKIM/DMARC configuration

## Environment Variables

Configure these in your `.env` file or Azure DevOps pipeline variables:

| Variable               | Required | Description                                       |
| ---------------------- | -------- | ------------------------------------------------- |
| `MAILOSAUR_API_KEY`    | Yes      | Your Mailosaur API key (from Mailosaur dashboard) |
| `MAILOSAUR_SERVER_ID`  | Yes      | Your Mailosaur server ID                          |
| `MAILOSAUR_TIMEOUT_MS` | No       | Timeout for waiting for messages (default: 30000) |

### Example `.env`

```env
MAILOSAUR_API_KEY=your-api-key-here
MAILOSAUR_SERVER_ID=abc123de
MAILOSAUR_TIMEOUT_MS=30000
LOGIN_PASSWORD=your-shared-password
```

## Placeholder Substitution

System entries may contain the `<serverId>` placeholder in email addresses. When you call `load()`, the framework **automatically substitutes** this placeholder with the value of `MAILOSAUR_SERVER_ID` at runtime.

```json
{
  "system.salesforce.mfaUsers.adminA": {
    "mfa": {
      "channels": {
        "email": { "sentTo": "admin@<serverId>.mailosaur.net" }
      }
    }
  }
}
```

At runtime, `load()` replaces `<serverId>` with your actual server ID. The committed JSON remains environment-agnostic.

---

## Fixture API Reference

### `mail` Fixture - Message Retrieval

Retrieve and inspect email content.

```typescript
// Wait for a message sent to recipient
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient);

// With criteria (using a SystemUser from systemValues fixture)
const user = systemValues["system.salesforce.mfaUsers.adminA"];
const message = await mail.waitForMessage(user, {
  subjectContains: "Order Confirmation",
  bodyContains: "$99.99",
  timeoutMs: 30000,
});

// Get latest message
const latest = await mail.getLatestMessage(recipient);
```

**Returns `NormalizedMessage`:**

```typescript
interface NormalizedMessage {
  id: string; // Unique message ID
  subject?: string; // Email subject line
  from?: string; // Sender email
  to?: string; // Recipient email
  receivedAt: Date; // When message was received
  textBody?: string; // Plain text body
  htmlBody?: string; // HTML body
  links: string[]; // Extracted URLs
  codes: string[]; // Extracted verification codes
  attachments: Attachment[]; // File attachments
}
```

### `otp` Fixture - OTP Extraction

Extract verification codes from MFA emails.

```typescript
// mfaUser comes from systemValues fixture
const mfaUser = systemValues["system.salesforce.mfaUsers.adminA"];
const result = await otp.waitForCode(mfaUser, { timeoutMs: 60000 });

console.log(result.code); // "123456"
console.log(result.receivedAt); // Date when OTP was received
```

**Returns `OtpResult`:**

```typescript
interface OtpResult {
  code: string; // The extracted OTP code
  message: NormalizedMessage; // Full message for inspection
  receivedAt: Date; // When the code was received
}
```

### `links` Fixture - Link Extraction

Extract verification, password reset, or action links.

```typescript
const recipient = "user@abc123.mailosaur.net";
const verifyLink = await links.waitForLink(recipient, {
  contains: "/verify",
  subjectContains: "Verify your email",
  timeoutMs: 30000,
});

// Navigate to the link
await page.goto(verifyLink);
```

### `mailCleanup` Fixture - Inbox Management

Clean up test messages.

```typescript
// Delete a specific message (after retrieving it)
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient);
await mailCleanup.deleteMessage(message.id);

// Clear all messages on server (use with caution!)
await mailCleanup.clearServer();
```

### `mailAttachments` Fixture - Attachment Handling

Download and inspect email attachments.

```typescript
// First retrieve the message
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient, { subjectContains: "Invoice" });

// List attachments from the message
const attachments = await mailAttachments.list(message.id);
console.log(attachments.length); // 2

// Download a specific attachment
const buffer = await mailAttachments.download(message.id, attachments[0].id);

// Get attachment with full content
const invoice = await mailAttachments.getWithContent(message.id, attachments[0]);
console.log(invoice.fileName); // "invoice.pdf"
console.log(invoice.contentType); // "application/pdf"
console.log(invoice.content); // Buffer

// Download all attachments
const allFiles = await mailAttachments.downloadAll(message.id);
```

**Attachment Types:**

```typescript
interface Attachment {
  id: string; // Attachment ID for downloading
  fileName: string; // Original filename
  contentType: string; // MIME type (e.g., "application/pdf")
  length: number; // Size in bytes
  contentId?: string; // For inline images (cid:)
}

interface AttachmentWithContent extends Attachment {
  content: Buffer; // Raw file bytes
}
```

### `mailAnalysis` Fixture - Spam & Deliverability

Analyze emails for spam characteristics and authentication.

#### Spam Analysis

Check if an email will land in spam folders.

```typescript
// First retrieve the message
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient, { subjectContains: "Newsletter" });

// Analyze spam score
const spam = await mailAnalysis.analyzeSpam(message.id);

console.log(spam.score); // 2.3 (lower is better, <5 typically safe)
console.log(spam.result); // "Pass" | "Warning" | "Fail"
console.log(spam.rules); // Array of triggered spam rules
```

**Spam Analysis Result:**

```typescript
interface SpamAnalysisResult {
  score: number; // Total spam score (lower = better)
  result: "Pass" | "Warning" | "Fail";
  rules: SpamAssassinRule[];
}

interface SpamAssassinRule {
  rule: string; // Rule ID (e.g., "HTML_IMAGE_RATIO")
  score: number; // Points added to spam score
  description: string; // Human explanation
}
```

**Example spam analysis output:**

```json
{
  "score": 2.3,
  "result": "Pass",
  "rules": [
    { "rule": "HTML_IMAGE_RATIO", "score": 0.8, "description": "HTML has low text to image ratio" },
    { "rule": "MIME_HTML_ONLY", "score": 0.1, "description": "Message only has HTML MIME parts" }
  ]
}
```

**Score interpretation:**

- **0-2**: Excellent - very unlikely to be spam
- **2-5**: Good - should reach inbox
- **5-10**: Warning - may be filtered as spam
- **10+**: High risk - likely blocked or spam-foldered

#### Deliverability Analysis (SPF/DKIM/DMARC)

Verify email authentication to ensure emails aren't rejected or marked suspicious.

```typescript
// First retrieve the message (must be a real SMTP-sent email)
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient, { subjectContains: "Welcome" });

// Analyze deliverability
const report = await mailAnalysis.analyzeDeliverability(message.id);

console.log(report.spf.result); // "Pass" or "Fail"
console.log(report.dkim.result); // "Pass" or "Fail"
console.log(report.dmarc.result); // "Pass" or "Fail"
```

**Deliverability Report:**

```typescript
interface DeliverabilityReport {
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
}

interface SpfResult {
  result: "Pass" | "Fail" | "SoftFail" | "Neutral" | "None";
  description: string;
}

interface DkimResult {
  result: "Pass" | "Fail" | "None";
  description: string;
  signingDomain?: string; // Domain that signed the email
}

interface DmarcResult {
  result: "Pass" | "Fail" | "None";
  description: string;
  policy?: "none" | "quarantine" | "reject";
}
```

**Example deliverability output:**

```json
{
  "spf": {
    "result": "Pass",
    "description": "Sender IP authorized by domain's SPF record"
  },
  "dkim": {
    "result": "Pass",
    "description": "Valid DKIM signature found",
    "signingDomain": "salesforce.com"
  },
  "dmarc": {
    "result": "Pass",
    "description": "Message aligns with domain's DMARC policy",
    "policy": "reject"
  }
}
```

**What each check means:**

| Check     | Purpose                               | If it fails...                        |
| --------- | ------------------------------------- | ------------------------------------- |
| **SPF**   | Verifies sending server is authorized | Emails may be rejected or marked spam |
| **DKIM**  | Verifies email signature is valid     | Emails may be marked as suspicious    |
| **DMARC** | Enforces SPF/DKIM alignment           | Receivers may reject based on policy  |

#### Preview URL

Get a browser-viewable URL for debugging emails.

```typescript
// First retrieve the message
const recipient = "user@abc123.mailosaur.net";
const message = await mail.waitForMessage(recipient);

// Get preview URL for debugging
const preview = await mailAnalysis.getPreviewUrl(message.id);
console.log(preview.url);
// https://mailosaur.com/dashboard/messages/abc123...
```

---

## Test Examples

### Validating Salesforce Email Content

Verify that Salesforce sends emails with correct content:

```typescript
test("[10001] Order confirmation email has correct content", async ({ mail, ordersPage }) => {
  const recipient = "customer@abc123.mailosaur.net";

  await test.step("Trigger order confirmation email from Salesforce", async () => {
    await ordersPage.navigateToOrder("12345");
    await ordersPage.clickSendConfirmation();
  });

  await test.step("Retrieve and validate email content", async () => {
    const message = await mail.waitForMessage(recipient, {
      subjectContains: "Order Confirmation",
      timeoutMs: 60000,
    });

    expect(message.subject).toBe("Order Confirmation #12345");
    expect(message.textBody).toContain("Thank you for your order");
    expect(message.textBody).toContain("$99.99");
    expect(message.from).toContain("noreply@yourcompany.com");
  });
});
```

### Validating Email Attachments (Invoices)

```typescript
test("[10002] Invoice email includes PDF attachment", async ({ mail, mailAttachments, invoicesPage }) => {
  const recipient = "billing@abc123.mailosaur.net";

  await test.step("Trigger invoice email from Salesforce", async () => {
    await invoicesPage.navigateToInvoice("INV-001");
    await invoicesPage.clickSendInvoice();
  });

  await test.step("Retrieve and validate invoice email", async () => {
    const message = await mail.waitForMessage(recipient, {
      subjectContains: "Invoice",
      timeoutMs: 60000,
    });

    // Verify attachments
    const attachments = await mailAttachments.list(message.id);
    expect(attachments.length).toBeGreaterThanOrEqual(1);

    const invoice = attachments.find((a) => a.fileName.endsWith(".pdf"));
    expect(invoice).toBeDefined();
    expect(invoice!.contentType).toBe("application/pdf");

    // Download and verify content exists
    const content = await mailAttachments.download(message.id, invoice!.id);
    expect(content.length).toBeGreaterThan(0);
  });
});
```

### Verifying Salesforce Deliverability Configuration

```typescript
test("[10003] Salesforce emails pass authentication checks", async ({ mail, mailAnalysis, contactsPage }) => {
  const recipient = "deliverability-test@abc123.mailosaur.net";

  await test.step("Trigger welcome email from Salesforce", async () => {
    await contactsPage.navigateToNewContact();
    await contactsPage.fillEmail(recipient);
    await contactsPage.saveAndSendWelcome();
  });

  await test.step("Retrieve email and verify deliverability", async () => {
    const message = await mail.waitForMessage(recipient, {
      subjectContains: "Welcome",
      timeoutMs: 120000, // Allow time for Salesforce to send
    });

    const report = await mailAnalysis.analyzeDeliverability(message.id);

    expect(report.spf.result).toBe("Pass");
    expect(report.dkim.result).toBe("Pass");
    expect(report.dmarc.result).toBe("Pass");

    // Log details for debugging
    console.log(`SPF: ${report.spf.result} - ${report.spf.description}`);
    console.log(`DKIM: ${report.dkim.result} - ${report.dkim.description}`);
    console.log(`DMARC: ${report.dmarc.result} - ${report.dmarc.description}`);
  });
});
```

### Verifying Marketing Emails Don't Trigger Spam Filters

```typescript
test("[10004] Marketing email has acceptable spam score", async ({ mail, mailAnalysis, campaignsPage }) => {
  const recipient = "marketing-test@abc123.mailosaur.net";

  await test.step("Trigger marketing email from Salesforce", async () => {
    await campaignsPage.navigateToCampaign("summer-sale");
    await campaignsPage.sendTestEmail(recipient);
  });

  await test.step("Retrieve email and analyze spam score", async () => {
    const message = await mail.waitForMessage(recipient, {
      subjectContains: "Special Offer",
      timeoutMs: 60000,
    });

    const spam = await mailAnalysis.analyzeSpam(message.id);

    // Score under 5 is generally safe
    expect(spam.score).toBeLessThan(5);
    expect(spam.result).not.toBe("Fail");

    // Log any triggered rules for review
    if (spam.rules.length > 0) {
      console.log("Spam rules triggered:");
      for (const rule of spam.rules) {
        console.log(`  ${rule.rule} (+${rule.score}): ${rule.description}`);
      }
    }
  });
});
```

### Extracting Password Reset Links

```typescript
test("[10005] Password reset flow works", async ({ links, loginPage, passwordResetPage }) => {
  const recipient = "user@abc123.mailosaur.net";

  await test.step("Request password reset", async () => {
    await loginPage.navigateToForgotPassword();
    await loginPage.submitForgotPasswordRequest(recipient);
  });

  await test.step("Retrieve reset link from email", async () => {
    const resetLink = await links.waitForLink(recipient, {
      contains: "/reset-password",
      subjectContains: "Reset your password",
      timeoutMs: 30000,
    });

    expect(resetLink).toContain("/reset-password");
  });

  await test.step("Complete password reset", async () => {
    const resetLink = await links.waitForLink(recipient, {
      contains: "/reset-password",
    });

    await passwordResetPage.navigateToResetLink(resetLink);
    await passwordResetPage.submitNewPassword("NewSecurePassword123!");
  });
});
```

### MFA Login (Invisible)

```typescript
test("[10006] Login with MFA user and access dashboard", async ({ autoPilot, dashboardPage, systemValues }) => {
  await test.step("Login with MFA-enabled user", async () => {
    const user = systemValues["system.salesforce.mfaUsers.adminA"];

    // MFA is handled automatically - framework waits for OTP
    await autoPilot.login(user);
  });

  await test.step("Verify dashboard access", async () => {
    await dashboardPage.verifyOnDashboard();
  });
});
```

---

## Running Live Integration Tests

The framework includes live integration tests that verify Mailosaur connectivity:

```bash
# Run Mailosaur live tests (requires .env configured)
npx playwright test --grep @mailosaur-live
```

**Note:** Deliverability analysis requires real SMTP-sent emails. Test-created messages (via `sdk.messages.create()`) don't have SPF/DKIM/DMARC data.

---

## Troubleshooting

### "MAILOSAUR_SERVER_ID environment variable is not set"

A system user entry contains `<serverId>` placeholder but `MAILOSAUR_SERVER_ID` is not set.

### "No OTP code found in message"

- Check the email was sent to the correct Mailosaur address
- Verify the message contains a recognizable code pattern (4-6 digits)
- Increase `timeoutMs` if the message takes longer to arrive

### "Multiple OTP codes found"

The message contains multiple codes. Use more specific subject/body criteria or review the email template.

### "Deliverability analysis not available"

Test-created messages don't have real authentication data. Use actual emails sent from Salesforce or another mail server for deliverability testing.

### Spam score is higher than expected

Review triggered rules in the `rules` array. Common issues:

- Low text-to-image ratio
- Missing unsubscribe link (for marketing emails)
- Suspicious URL patterns
- HTML-only content without text alternative
