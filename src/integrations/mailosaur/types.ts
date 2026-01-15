// Mailosaur integration types.

// Normalized message representation for consistent API across the framework.
export interface NormalizedMessage {
  id: string;
  subject?: string;
  from?: string;
  to?: string;
  receivedAt: Date;
  textBody?: string;
  htmlBody?: string;
  links: string[];
  codes: string[];
  attachments: Attachment[];  // Email attachments metadata
}

// Criteria for searching/waiting for messages.
export interface MessageCriteria {
  sentTo: string;
  subjectContains?: string;
  bodyContains?: string;
  timeoutMs?: number;
}

// MFA channel configuration for a single channel.
export interface MfaChannelConfig {
  sentTo: string;
}

// MFA configuration for system users.
export interface MfaConfig {
  provider: "mailosaur";
  channels: {
    email?: MfaChannelConfig;
    sms?: MfaChannelConfig;
  };
  defaultChannel?: "email" | "sms";
}

// System user with optional MFA configuration.
export interface SystemUser {
  username: string;
  email?: string;
  mfa?: MfaConfig;
}

// Login options for AutoPilot.
export interface LoginOptions {
  mfaChannel?: "email" | "sms";
}

// OTP result returned by otp.waitForCode.
export interface OtpResult {
  code: string;
  message: NormalizedMessage;
  receivedAt: Date;
}

// Link search options.
export interface LinkSearchOptions {
  contains: string;
  subjectContains?: string;
  timeoutMs?: number;
}

// --- Spam Analysis Types ---

// Individual spam rule that was triggered.
export interface SpamAssassinRule {
  rule: string;        // Rule identifier (e.g., "HTML_IMAGE_RATIO")
  score: number;       // Points added to spam score
  description: string; // Human-readable explanation
}

// Spam analysis result from SpamAssassin.
export interface SpamAnalysisResult {
  score: number;                  // Total spam score (lower = better, <5 typically safe)
  result: "Pass" | "Warning" | "Fail"; // Overall assessment
  rules: SpamAssassinRule[];      // All rules that triggered
}

// --- Email Deliverability Types ---

// SPF (Sender Policy Framework) check result.
export interface SpfResult {
  result: "Pass" | "Fail" | "SoftFail" | "Neutral" | "None" | "TempError" | "PermError";
  description: string;
}

// DKIM (DomainKeys Identified Mail) check result.
export interface DkimResult {
  result: "Pass" | "Fail" | "None";
  description: string;
  signingDomain?: string;  // Domain that signed the email
}

// DMARC (Domain-based Message Authentication) check result.
export interface DmarcResult {
  result: "Pass" | "Fail" | "None";
  description: string;
  policy?: "none" | "quarantine" | "reject"; // Domain's DMARC policy
}

// Complete deliverability report for an email.
export interface DeliverabilityReport {
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
}

// --- Attachment Types ---

// Email attachment metadata and content.
export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;  // MIME type (e.g., "application/pdf", "image/png")
  length: number;       // Size in bytes
  contentId?: string;   // For inline attachments (images in HTML)
}

// Attachment with downloaded content.
export interface AttachmentWithContent extends Attachment {
  content: Buffer;      // Raw file content
}

// --- Preview Types ---

// Email preview URLs for debugging.
export interface EmailPreview {
  messageId: string;
  previewUrl: string;   // Browser-viewable URL to see email as rendered
}

// MFA helper interface for AutoPilot dependency injection.
export interface MfaHelper {
  waitForOtp(sentTo: string, timeoutMs?: number): Promise<OtpResult>;
  resolveChannel(user: SystemUser, override?: "email" | "sms"): "email" | "sms";
  getSentTo(user: SystemUser, channel: "email" | "sms"): string;
}
