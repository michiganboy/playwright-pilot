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

// MFA helper interface for AutoPilot dependency injection.
export interface MfaHelper {
  waitForOtp(sentTo: string, timeoutMs?: number): Promise<OtpResult>;
  resolveChannel(user: SystemUser, override?: "email" | "sms"): "email" | "sms";
  getSentTo(user: SystemUser, channel: "email" | "sms"): string;
}
