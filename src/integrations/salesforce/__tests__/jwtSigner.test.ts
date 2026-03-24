import { describe, test, expect } from "@jest/globals";
import { generateKeyPairSync, createVerify } from "crypto";
import { buildJwtClaims, signJwtAssertion } from "../jwtSigner";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("buildJwtClaims", () => {
  test("produces correct claim structure", () => {
    const before = Math.floor(Date.now() / 1000);
    const claims = buildJwtClaims(
      "consumer-key",
      "user@org.com",
      "https://login.salesforce.com",
      180
    );
    const after = Math.floor(Date.now() / 1000);

    expect(claims.iss).toBe("consumer-key");
    expect(claims.sub).toBe("user@org.com");
    expect(claims.aud).toBe("https://login.salesforce.com");
    expect(claims.exp).toBeGreaterThanOrEqual(before + 180);
    expect(claims.exp).toBeLessThanOrEqual(after + 180);
  });

  test("uses the provided lifetime", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = buildJwtClaims("ck", "u", "aud", 60);
    expect(claims.exp - now).toBeGreaterThanOrEqual(59);
    expect(claims.exp - now).toBeLessThanOrEqual(61);
  });
});

describe("signJwtAssertion", () => {
  const claims = buildJwtClaims(
    "consumer-key",
    "user@org.com",
    "https://login.salesforce.com",
    180
  );

  test("returns a three-part JWT string", () => {
    const jwt = signJwtAssertion(claims, privateKey);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  test("header decodes to RS256", () => {
    const jwt = signJwtAssertion(claims, privateKey);
    const headerJson = Buffer.from(jwt.split(".")[0], "base64url").toString("utf8");
    const header = JSON.parse(headerJson);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
  });

  test("payload decodes to the provided claims", () => {
    const jwt = signJwtAssertion(claims, privateKey);
    const payloadJson = Buffer.from(jwt.split(".")[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    expect(payload.iss).toBe(claims.iss);
    expect(payload.sub).toBe(claims.sub);
    expect(payload.aud).toBe(claims.aud);
    expect(payload.exp).toBe(claims.exp);
  });

  test("signature verifies with the corresponding public key", () => {
    const jwt = signJwtAssertion(claims, privateKey);
    const [header, payload, signature] = jwt.split(".");
    const signingInput = `${header}.${payload}`;

    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    const isValid = verifier.verify(publicKey, signature, "base64url");

    expect(isValid).toBe(true);
  });

  test("throws with an invalid private key", () => {
    expect(() => signJwtAssertion(claims, "not-a-real-key")).toThrow();
  });
});
