// Mailosaur client wrapper for message retrieval.
// Requires: npm install mailosaur
import type {
  NormalizedMessage,
  MessageCriteria,
  OtpResult,
  MfaHelper,
  SystemUser,
  SpamAnalysisResult,
  DeliverabilityReport,
  Attachment,
  AttachmentWithContent,
  EmailPreview,
} from "./types";
import { normalizeMessage, extractCodes } from "./parsers";

// Environment variable names (exact as specified).
const ENV_API_KEY = "MAILOSAUR_API_KEY";
const ENV_SERVER_ID = "MAILOSAUR_SERVER_ID";
const ENV_TIMEOUT_MS = "MAILOSAUR_TIMEOUT_MS";

const DEFAULT_TIMEOUT_MS = 30000;

// Mailosaur SDK types (minimal interface for what we use).
interface MailosaurSdkAttachment {
  id: string;
  fileName: string;
  contentType: string;
  length: number;
  contentId?: string;
}

interface MailosaurSdkMessage {
  id: string;
  subject?: string;
  from?: Array<{ email?: string; name?: string }>;
  to?: Array<{ email?: string; phone?: string }>;
  received?: string;
  text?: { body?: string; codes?: Array<{ value: string }> };
  html?: { body?: string; links?: Array<{ href: string }> };
  attachments?: MailosaurSdkAttachment[];
}

interface MailosaurSdkSpamResult {
  score: number;
  result: string;
  rules: Array<{ rule: string; score: number; description: string }>;
}

interface MailosaurSdkDeliverabilityResult {
  spf: { result: string; description: string };
  dkim: Array<{ result: string; description: string; signingDomain?: string }>;
  dmarc: { result: string; description: string; policy?: string };
}

interface MailosaurSdkClient {
  messages: {
    get(serverId: string, criteria: { sentTo: string }, options?: { timeout?: number }): Promise<MailosaurSdkMessage>;
    getById(id: string): Promise<MailosaurSdkMessage>;
    list(serverId: string, options?: { page?: number; itemsPerPage?: number }): Promise<{ items: MailosaurSdkMessage[] }>;
    del(id: string): Promise<void>;
    deleteAll(serverId: string): Promise<void>;
  };
  analysis: {
    spam(messageId: string): Promise<MailosaurSdkSpamResult>;
    deliverability(messageId: string): Promise<MailosaurSdkDeliverabilityResult>;
  };
  files: {
    getAttachment(attachmentId: string): Promise<Buffer>;
  };
}

// Client configuration.
export interface MailosaurClientConfig {
  apiKey: string;
  serverId: string;
  defaultTimeoutMs: number;
}

// Loads configuration from environment variables.
export function loadConfigFromEnv(): MailosaurClientConfig {
  const apiKey = process.env[ENV_API_KEY];
  const serverId = process.env[ENV_SERVER_ID];
  const timeoutMs = process.env[ENV_TIMEOUT_MS];

  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${ENV_API_KEY}`);
  }
  if (!serverId) {
    throw new Error(`Missing required environment variable: ${ENV_SERVER_ID}`);
  }

  return {
    apiKey,
    serverId,
    defaultTimeoutMs: timeoutMs ? parseInt(timeoutMs, 10) : DEFAULT_TIMEOUT_MS,
  };
}

// Mailosaur client wrapper.
export class MailosaurClient {
  private client: MailosaurSdkClient | null = null;
  private config: MailosaurClientConfig;

  constructor(config?: MailosaurClientConfig) {
    this.config = config || loadConfigFromEnv();
  }

  // Lazily initializes the Mailosaur SDK client.
  private async getClient(): Promise<MailosaurSdkClient> {
    if (this.client) {
      return this.client;
    }

    try {
      // Dynamic import to allow graceful failure if mailosaur is not installed
      const MailosaurModule = await import("mailosaur");
      const Mailosaur = MailosaurModule.default || MailosaurModule;
      this.client = new Mailosaur(this.config.apiKey) as MailosaurSdkClient;
      return this.client;
    } catch (error) {
      throw new Error(
        `Failed to initialize Mailosaur client. Ensure 'mailosaur' package is installed: npm install mailosaur. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Returns the server ID from configuration.
  getServerId(): string {
    return this.config.serverId;
  }

  // Returns the default timeout from configuration.
  getDefaultTimeoutMs(): number {
    return this.config.defaultTimeoutMs;
  }

  // Waits for a message matching the criteria.
  async waitForMessage(criteria: MessageCriteria): Promise<NormalizedMessage> {
    const client = await this.getClient();
    const timeoutMs = criteria.timeoutMs ?? this.config.defaultTimeoutMs;

    const message = await client.messages.get(this.config.serverId, { sentTo: criteria.sentTo }, { timeout: timeoutMs });

    const normalized = normalizeMessage(message);

    // Validate subject/body criteria if provided
    if (criteria.subjectContains && !normalized.subject?.includes(criteria.subjectContains)) {
      throw new Error(
        `Message subject "${normalized.subject}" does not contain expected text "${criteria.subjectContains}". ` +
          `sentTo: ${criteria.sentTo}`
      );
    }

    if (criteria.bodyContains) {
      const body = normalized.textBody || normalized.htmlBody || "";
      if (!body.includes(criteria.bodyContains)) {
        throw new Error(
          `Message body does not contain expected text "${criteria.bodyContains}". sentTo: ${criteria.sentTo}`
        );
      }
    }

    return normalized;
  }

  // Gets the latest message for a recipient (uses list with limit 1).
  async getLatestMessage(criteria: MessageCriteria): Promise<NormalizedMessage> {
    return this.waitForMessage(criteria);
  }

  // Deletes a message by ID (optional utility).
  async deleteMessage(id: string): Promise<void> {
    const client = await this.getClient();
    await client.messages.del(id);
  }

  // Deletes all messages for the server (optional utility).
  async deleteAllMessagesForServer(): Promise<void> {
    const client = await this.getClient();
    await client.messages.deleteAll(this.config.serverId);
  }

  // --- Spam Analysis ---

  // Analyzes a message for spam characteristics using SpamAssassin.
  async analyzeSpam(messageId: string): Promise<SpamAnalysisResult> {
    const client = await this.getClient();
    const result = await client.analysis.spam(messageId);

    return {
      score: result.score ?? 0,
      result: (result.result as "Pass" | "Warning" | "Fail") || "Pass",
      rules: (result.rules || []).map((r) => ({
        rule: r.rule,
        score: r.score,
        description: r.description,
      })),
    };
  }

  // --- Email Deliverability ---

  // Checks email authentication (SPF, DKIM, DMARC).
  async analyzeDeliverability(messageId: string): Promise<DeliverabilityReport> {
    const client = await this.getClient();
    const result = await client.analysis.deliverability(messageId);

    // DKIM can have multiple signatures; use the first one
    const dkimResult = result.dkim?.[0] || { result: "None", description: "No DKIM signature found" };

    return {
      spf: {
        result: result.spf.result as DeliverabilityReport["spf"]["result"],
        description: result.spf.description,
      },
      dkim: {
        result: dkimResult.result as DeliverabilityReport["dkim"]["result"],
        description: dkimResult.description,
        signingDomain: dkimResult.signingDomain,
      },
      dmarc: {
        result: result.dmarc.result as DeliverabilityReport["dmarc"]["result"],
        description: result.dmarc.description,
        policy: result.dmarc.policy as DeliverabilityReport["dmarc"]["policy"],
      },
    };
  }

  // --- Attachments ---

  // Gets attachment metadata from a message.
  getAttachmentsFromMessage(message: NormalizedMessage): Attachment[] {
    return message.attachments || [];
  }

  // Downloads attachment content by ID.
  async downloadAttachment(attachmentId: string): Promise<Buffer> {
    const client = await this.getClient();
    return client.files.getAttachment(attachmentId);
  }

  // Downloads attachment with full metadata.
  async getAttachmentWithContent(attachment: Attachment): Promise<AttachmentWithContent> {
    const content = await this.downloadAttachment(attachment.id);
    return {
      ...attachment,
      content,
    };
  }

  // Downloads all attachments from a message.
  async downloadAllAttachments(message: NormalizedMessage): Promise<AttachmentWithContent[]> {
    const attachments = this.getAttachmentsFromMessage(message);
    const results: AttachmentWithContent[] = [];

    for (const attachment of attachments) {
      const withContent = await this.getAttachmentWithContent(attachment);
      results.push(withContent);
    }

    return results;
  }

  // --- Email Preview ---

  // Gets a browser-viewable preview URL for an email.
  getPreviewUrl(messageId: string): EmailPreview {
    // Mailosaur preview URL format
    return {
      messageId,
      previewUrl: `https://mailosaur.com/dashboard/messages/${messageId}`,
    };
  }

  // Gets message by ID (useful for retrieving full details).
  async getMessageById(messageId: string): Promise<NormalizedMessage> {
    const client = await this.getClient();
    const message = await client.messages.getById(messageId);
    return normalizeMessage(message);
  }
}

// Creates an MFA helper for AutoPilot integration.
export function createMfaHelper(client: MailosaurClient): MfaHelper {
  return {
    async waitForOtp(sentTo: string, timeoutMs?: number): Promise<OtpResult> {
      const message = await client.waitForMessage({
        sentTo,
        timeoutMs: timeoutMs ?? client.getDefaultTimeoutMs(),
      });

      const codes = extractCodes(message);

      if (codes.length === 0) {
        throw new Error(`No OTP code found in message. sentTo: ${sentTo}, subject: ${message.subject || "(no subject)"}`);
      }

      if (codes.length > 1) {
        throw new Error(
          `Multiple OTP codes found in message: [${codes.join(", ")}]. ` +
            `sentTo: ${sentTo}, subject: ${message.subject || "(no subject)"}. ` +
            `Cannot determine which code to use.`
        );
      }

      return {
        code: codes[0],
        message,
        receivedAt: message.receivedAt,
      };
    },

    resolveChannel(user: SystemUser, override?: "email" | "sms"): "email" | "sms" {
      if (!user.mfa || user.mfa.provider !== "mailosaur") {
        throw new Error(
          `Cannot resolve MFA channel: user does not have Mailosaur MFA configured. ` +
            `Expected user.mfa.provider === "mailosaur".`
        );
      }

      const channels = user.mfa.channels;
      const hasEmail = !!channels.email?.sentTo;
      const hasSms = !!channels.sms?.sentTo;

      // Rule 1: Override always wins if channel exists
      if (override) {
        const channelConfig = channels[override];
        if (!channelConfig?.sentTo) {
          throw new Error(
            `MFA channel override "${override}" requested but channel is not configured for this user. ` +
              `Available channels: ${[hasEmail && "email", hasSms && "sms"].filter(Boolean).join(", ") || "none"}.`
          );
        }
        return override;
      }

      // Rule 2: Single channel - use it
      if (hasEmail && !hasSms) {
        return "email";
      }
      if (hasSms && !hasEmail) {
        return "sms";
      }

      // Rule 3: Multiple channels - require defaultChannel
      if (hasEmail && hasSms) {
        if (user.mfa.defaultChannel) {
          return user.mfa.defaultChannel;
        }
        throw new Error(
          `User has multiple MFA channels (email, sms) but no defaultChannel specified and no override provided. ` +
            `Either set user.mfa.defaultChannel or pass { mfaChannel: "email" | "sms" } to login().`
        );
      }

      // No channels configured
      throw new Error(
        `User has Mailosaur MFA configured but no channels defined. ` +
          `Expected at least one of: user.mfa.channels.email.sentTo or user.mfa.channels.sms.sentTo.`
      );
    },

    getSentTo(user: SystemUser, channel: "email" | "sms"): string {
      if (!user.mfa || user.mfa.provider !== "mailosaur") {
        throw new Error(`Cannot get sentTo: user does not have Mailosaur MFA configured.`);
      }

      const channelConfig = user.mfa.channels[channel];
      if (!channelConfig?.sentTo) {
        throw new Error(`MFA channel "${channel}" is not configured for this user.`);
      }

      return channelConfig.sentTo;
    },
  };
}

// Singleton instance for shared use.
let sharedClient: MailosaurClient | null = null;

// Gets or creates a shared Mailosaur client instance.
export function getSharedClient(): MailosaurClient {
  if (!sharedClient) {
    sharedClient = new MailosaurClient();
  }
  return sharedClient;
}

// Resets the shared client (for testing).
export function resetSharedClient(): void {
  sharedClient = null;
}
