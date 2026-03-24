// Salesforce integration barrel exports.
export type {
  SalesforceAuthConfig,
  SalesforceTokenResponse,
  SalesforceTokenError,
  JwtClaims,
  JwtHeader,
} from "./types";
export {
  loadSalesforceConfig,
  validateSalesforceConfig,
  isSalesforceAuthEnabled,
} from "./config";
export { buildJwtClaims, signJwtAssertion } from "./jwtSigner";
export { exchangeJwtForToken, formatTokenError } from "./tokenClient";
export { buildFrontdoorUrl, redactFrontdoorUrl } from "./frontdoor";
export { verifySalesforceSession } from "./sessionVerifier";
export {
  SalesforceAuthProvider,
  createSalesforceAuthProvider,
  createSalesforceAuthIfConfigured,
} from "./salesforceAuth";
