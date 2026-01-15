// Mailosaur fixtures: mail, otp, links, mailCleanup, mailAttachments.
// Spread into test-fixtures.ts to enable Mailosaur integration.
import type { TestInfo } from "@playwright/test";
import type {
  NormalizedMessage,
  MessageCriteria,
  OtpResult,
  LinkSearchOptions,
  SystemUser,
  MfaConfig,
} from "../../src/integrations/mailosaur/types";
import { MailosaurClient, createMfaHelper } from "../../src/integrations/mailosaur/MailosaurClient";

// Type guard to check if a user has Mailosaur MFA configured.
function hasMailosaurMfa(user: unknown): user is SystemUser & { mfa: MfaConfig } {
  if (!user || typeof user !== "object") return false;
  const u = user as SystemUser;
  return u.mfa?.provider === "mailosaur";
}

// Resolves sentTo from user or string input.
function resolveSentTo(userOrRecipient: string | SystemUser, resolvedChannel?: "email" | "sms"): string {
  if (typeof userOrRecipient === "string") {
    return userOrRecipient;
  }

  // If user has Mailosaur MFA, use the resolved channel
  if (hasMailosaurMfa(userOrRecipient) && resolvedChannel) {
    const channelConfig = userOrRecipient.mfa.channels[resolvedChannel];
    if (channelConfig?.sentTo) {
      return channelConfig.sentTo;
    }
  }

  // Fallback: use email or username for non-MFA message checks
  if (userOrRecipient.email) {
    return userOrRecipient.email;
  }
  if (userOrRecipient.username) {
    return userOrRecipient.username;
  }

  throw new Error(
    `Cannot resolve sentTo from user. User must have email, username, or MFA channel configured. ` +
      `Received: ${JSON.stringify(userOrRecipient)}`
  );
}

// Resolves the channel for a user with Mailosaur MFA.
function resolveChannel(user: SystemUser): "email" | "sms" | undefined {
  if (!hasMailosaurMfa(user)) {
    return undefined;
  }

  const channels = user.mfa.channels;
  const hasEmail = !!channels.email?.sentTo;
  const hasSms = !!channels.sms?.sentTo;

  if (hasEmail && !hasSms) return "email";
  if (hasSms && !hasEmail) return "sms";
  if (hasEmail && hasSms && user.mfa.defaultChannel) {
    return user.mfa.defaultChannel;
  }

  return undefined;
}

// Mail fixture interface.
export interface MailFixture {
  waitForMessage(userOrRecipient: string | SystemUser, criteria?: Partial<MessageCriteria>): Promise<NormalizedMessage>;
  getLatestMessage(userOrRecipient: string | SystemUser, criteria?: Partial<MessageCriteria>): Promise<NormalizedMessage>;
}

// OTP fixture interface.
export interface OtpFixture {
  waitForCode(
    mfaUser: SystemUser,
    options?: { timeoutMs?: number; subjectContains?: string }
  ): Promise<OtpResult>;
}

// Links fixture interface.
export interface LinksFixture {
  waitForLink(userOrRecipient: string | SystemUser, options: LinkSearchOptions): Promise<string>;
}

// Mail cleanup fixture interface (optional).
export interface MailCleanupFixture {
  deleteMessage(messageId: string): Promise<void>;
  clearServer(): Promise<void>;
}

// Mail attachments fixture interface (future).
export interface MailAttachmentsFixture {
  // Future: list(messageId: string): Promise<Attachment[]>;
  // Future: get(messageId: string, attachmentIndex: number): Promise<Buffer>;
}

// Lazy client factory to defer initialization until fixture is used.
let lazyClient: MailosaurClient | null = null;

function getClient(): MailosaurClient {
  if (!lazyClient) {
    lazyClient = new MailosaurClient();
  }
  return lazyClient;
}

// Creates the mail fixture.
function createMailFixture(): MailFixture {
  return {
    async waitForMessage(
      userOrRecipient: string | SystemUser,
      criteria?: Partial<MessageCriteria>
    ): Promise<NormalizedMessage> {
      const client = getClient();
      const channel = typeof userOrRecipient === "object" ? resolveChannel(userOrRecipient) : undefined;
      const sentTo = resolveSentTo(userOrRecipient, channel);

      return client.waitForMessage({
        sentTo,
        subjectContains: criteria?.subjectContains,
        bodyContains: criteria?.bodyContains,
        timeoutMs: criteria?.timeoutMs,
      });
    },

    async getLatestMessage(
      userOrRecipient: string | SystemUser,
      criteria?: Partial<MessageCriteria>
    ): Promise<NormalizedMessage> {
      const client = getClient();
      const channel = typeof userOrRecipient === "object" ? resolveChannel(userOrRecipient) : undefined;
      const sentTo = resolveSentTo(userOrRecipient, channel);

      return client.getLatestMessage({
        sentTo,
        subjectContains: criteria?.subjectContains,
        bodyContains: criteria?.bodyContains,
        timeoutMs: criteria?.timeoutMs,
      });
    },
  };
}

// Creates the OTP fixture.
function createOtpFixture(mail: MailFixture): OtpFixture {
  return {
    async waitForCode(
      mfaUser: SystemUser,
      options?: { timeoutMs?: number; subjectContains?: string }
    ): Promise<OtpResult> {
      if (!hasMailosaurMfa(mfaUser)) {
        throw new Error(
          `otp.waitForCode requires a user with Mailosaur MFA configured. ` +
            `Expected user.mfa.provider === "mailosaur".`
        );
      }

      const client = getClient();
      const helper = createMfaHelper(client);
      const channel = helper.resolveChannel(mfaUser);
      const sentTo = helper.getSentTo(mfaUser, channel);

      return helper.waitForOtp(sentTo, options?.timeoutMs);
    },
  };
}

// Creates the links fixture.
function createLinksFixture(mail: MailFixture): LinksFixture {
  return {
    async waitForLink(userOrRecipient: string | SystemUser, options: LinkSearchOptions): Promise<string> {
      const message = await mail.waitForMessage(userOrRecipient, {
        subjectContains: options.subjectContains,
        timeoutMs: options.timeoutMs,
      });

      const matchingLinks = message.links.filter((link) => link.includes(options.contains));

      if (matchingLinks.length === 0) {
        throw new Error(
          `No link containing "${options.contains}" found in message. ` +
            `Available links: ${message.links.length > 0 ? message.links.join(", ") : "(none)"}. ` +
            `Subject: ${message.subject || "(no subject)"}`
        );
      }

      // Return first matching link
      return matchingLinks[0];
    },
  };
}

// Creates the mail cleanup fixture (optional).
function createMailCleanupFixture(): MailCleanupFixture {
  return {
    async deleteMessage(messageId: string): Promise<void> {
      const client = getClient();
      await client.deleteMessage(messageId);
    },

    async clearServer(): Promise<void> {
      const client = getClient();
      await client.deleteAllMessagesForServer();
    },
  };
}

// Exported fixtures object to spread into test-fixtures.ts.
export const mailosaurFixtures = {
  mail: async ({}, use: (value: MailFixture) => Promise<void>, _testInfo: TestInfo) => {
    await use(createMailFixture());
  },

  otp: async (
    { mail }: { mail: MailFixture },
    use: (value: OtpFixture) => Promise<void>,
    _testInfo: TestInfo
  ) => {
    await use(createOtpFixture(mail));
  },

  links: async (
    { mail }: { mail: MailFixture },
    use: (value: LinksFixture) => Promise<void>,
    _testInfo: TestInfo
  ) => {
    await use(createLinksFixture(mail));
  },

  mailCleanup: async ({}, use: (value: MailCleanupFixture) => Promise<void>, _testInfo: TestInfo) => {
    await use(createMailCleanupFixture());
  },
};

// Type exports for test authors.
export type { NormalizedMessage, OtpResult, LinkSearchOptions, MessageCriteria };
