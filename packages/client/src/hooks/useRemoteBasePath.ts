/**
 * Hook for getting the base path for relay mode URLs.
 *
 * When in relay mode (/:relayUsername/*), this returns the base path
 * including the username, so links can be constructed correctly.
 *
 * Note: With base="/remote/", the router path "/{username}" becomes
 * browser URL "/remote/{username}". This hook returns the router path.
 */

import { useParams } from "react-router-dom";

/**
 * Get the base path for the current relay host.
 *
 * @returns The base path (e.g., "/my-server") or empty string if not in relay mode
 */
export function useRemoteBasePath(): string {
  const { relayUsername } = useParams<{ relayUsername: string }>();
  return relayUsername ? `/${relayUsername}` : "";
}

/**
 * Hook to get the current relay username from the URL.
 *
 * @returns The relay username or undefined if not in relay mode
 */
export function useRelayUsername(): string | undefined {
  const { relayUsername } = useParams<{ relayUsername: string }>();
  return relayUsername;
}
