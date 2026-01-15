// Centralized parsing rules for OTP codes and links.
// Edit this file to customize extraction patterns.

// OTP code extraction patterns (ordered by priority).
// Each pattern should capture the code in group 1.
export const OTP_PATTERNS: RegExp[] = [
  // 6-digit codes (most common)
  /\b(\d{6})\b/,
  // 4-digit codes
  /\b(\d{4})\b/,
  // 8-digit codes
  /\b(\d{8})\b/,
  // Alphanumeric codes (e.g., "A1B2C3")
  /\b([A-Z0-9]{6})\b/i,
  // Codes with dashes (e.g., "123-456")
  /\b(\d{3}-\d{3})\b/,
];

// Link extraction pattern for fallback parsing.
// Matches http/https URLs.
export const LINK_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// Patterns to exclude from link extraction (tracking pixels, etc.).
export const LINK_EXCLUDE_PATTERNS: RegExp[] = [
  /\.gif$/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /tracking\./i,
  /pixel\./i,
  /beacon\./i,
  /open\.mailosaur\./i,
];
