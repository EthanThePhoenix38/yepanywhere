/**
 * Symbol used to mark requests as pre-authenticated from internal sources.
 *
 * This is used by the WebSocket relay handler to indicate that a request
 * has already been authenticated via SRP tunnel. The auth middleware
 * checks for this symbol and skips local password authentication.
 *
 * Using a Symbol ensures this cannot be forged by external clients since
 * Symbols are not serializable and can only be set by code running in
 * the same process.
 */
export const SRP_AUTHENTICATED = Symbol("srp-authenticated");
