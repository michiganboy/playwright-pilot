// Salesforce JWT-frontdoor authentication types.
import type { Page } from "@playwright/test";

export interface SalesforceAuthConfig {
  clientId: string;
  username: string;
  loginUrl: string;
  privateKeyPath?: string;
  privateKeyContent?: string;
  retUrl?: string;
  expectedDomain?: string;
  storageStatePath?: string;
  /** JWT assertion lifetime in seconds (1-300). Salesforce enforces a 300s max. */
  tokenLifetimeSec: number;
}

export interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface SalesforceTokenError {
  error: string;
  error_description: string;
}

export interface JwtHeader {
  alg: "RS256";
  typ: "JWT";
}

export interface JwtClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
}
