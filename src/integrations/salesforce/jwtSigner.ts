// JWT assertion builder and RS256 signer for Salesforce JWT bearer flow.
import { createSign } from "crypto";
import type { JwtClaims, JwtHeader } from "./types";

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function buildJwtClaims(
  clientId: string,
  username: string,
  audience: string,
  lifetimeSec: number
): JwtClaims {
  return {
    iss: clientId,
    sub: username,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + lifetimeSec,
  };
}

/**
 * Builds and signs a JWT assertion with RS256.
 * Returns the compact serialization: header.payload.signature
 */
export function signJwtAssertion(claims: JwtClaims, privateKeyPem: string): string {
  const header: JwtHeader = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(privateKeyPem, "base64url");
  return `${signingInput}.${signature}`;
}
