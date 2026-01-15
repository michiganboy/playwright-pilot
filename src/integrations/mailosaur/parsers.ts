// Mailosaur message parsing utilities.
import type { NormalizedMessage, Attachment } from "./types";
import { OTP_PATTERNS, LINK_PATTERN, LINK_EXCLUDE_PATTERNS } from "./parsingRules";

// Type for raw Mailosaur message from SDK.
interface MailosaurAttachment {
  id: string;
  fileName: string;
  contentType: string;
  length: number;
  contentId?: string;
}

interface MailosaurMessage {
  id: string;
  subject?: string;
  from?: Array<{ email?: string; name?: string }>;
  to?: Array<{ email?: string; phone?: string }>;
  received?: string;
  text?: { body?: string; codes?: Array<{ value: string }> };
  html?: { body?: string; links?: Array<{ href: string }> };
  attachments?: MailosaurAttachment[];
}

// Normalizes a raw Mailosaur message to NormalizedMessage format.
// Throws if receivedAt timestamp is missing from the message.
export function normalizeMessage(mailosaurMessage: MailosaurMessage): NormalizedMessage {
  const from = mailosaurMessage.from?.[0]?.email || mailosaurMessage.from?.[0]?.name;
  const to = mailosaurMessage.to?.[0]?.email || mailosaurMessage.to?.[0]?.phone;

  // Extract codes from Mailosaur SDK or fallback to regex
  const sdkCodes = mailosaurMessage.text?.codes?.map((c) => c.value) || [];
  const textBody = mailosaurMessage.text?.body || "";
  const htmlBody = mailosaurMessage.html?.body || "";
  const codes = sdkCodes.length > 0 ? sdkCodes : extractCodesFromText(textBody || htmlBody);

  // Extract links from Mailosaur SDK or fallback to regex
  const sdkLinks = mailosaurMessage.html?.links?.map((l) => l.href) || [];
  const links = sdkLinks.length > 0 ? sdkLinks : extractLinksFromText(textBody || htmlBody);

  // Validate receivedAt - do not fabricate timestamps
  if (!mailosaurMessage.received) {
    throw new Error(
      `Message receivedAt timestamp is missing. Message ID: ${mailosaurMessage.id}, ` +
        `subject: ${mailosaurMessage.subject || "(no subject)"}. ` +
        `Cannot proceed without a valid received timestamp.`
    );
  }

  // Parse attachments
  const attachments: Attachment[] = (mailosaurMessage.attachments || []).map((a) => ({
    id: a.id,
    fileName: a.fileName,
    contentType: a.contentType,
    length: a.length,
    contentId: a.contentId,
  }));

  return {
    id: mailosaurMessage.id,
    subject: mailosaurMessage.subject,
    from,
    to,
    receivedAt: new Date(mailosaurMessage.received),
    textBody: textBody || undefined,
    htmlBody: htmlBody || undefined,
    links,
    codes,
    attachments,
  };
}

// Extracts OTP codes from text using patterns from parsingRules.
export function extractCodes(normalizedMessage: NormalizedMessage): string[] {
  // Prefer codes already extracted during normalization
  if (normalizedMessage.codes.length > 0) {
    return normalizedMessage.codes;
  }

  const text = normalizedMessage.textBody || normalizedMessage.htmlBody || "";
  return extractCodesFromText(text);
}

// Internal helper to extract codes from raw text.
function extractCodesFromText(text: string): string[] {
  const codes: string[] = [];

  for (const pattern of OTP_PATTERNS) {
    const matches = text.match(new RegExp(pattern, "g"));
    if (matches) {
      for (const match of matches) {
        const result = pattern.exec(match);
        if (result && result[1]) {
          codes.push(result[1]);
        }
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(codes)];
}

// Extracts links from text using patterns from parsingRules.
export function extractLinks(normalizedMessage: NormalizedMessage): string[] {
  // Prefer links already extracted during normalization
  if (normalizedMessage.links.length > 0) {
    return normalizedMessage.links;
  }

  const text = normalizedMessage.textBody || normalizedMessage.htmlBody || "";
  return extractLinksFromText(text);
}

// Internal helper to extract links from raw text.
function extractLinksFromText(text: string): string[] {
  const matches = text.match(LINK_PATTERN) || [];

  // Filter out excluded patterns
  const filtered = matches.filter((link) => {
    return !LINK_EXCLUDE_PATTERNS.some((pattern) => pattern.test(link));
  });

  // Deduplicate while preserving order
  return [...new Set(filtered)];
}
