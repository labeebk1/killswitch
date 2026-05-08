import { satisfies, valid } from "semver";
import type { VersionRejectedEnvelope } from "@killswitch/shared";

/**
 * Semver range this server accepts from connecting CLIs.
 *
 * Widen as backward-compatible CLI releases ship.
 * Narrow (bump lower bound) after a breaking protocol change to force upgrades.
 */
export const ACCEPTED_PROTOCOL_VERSION_RANGE = ">=0.1.0 <2.0.0";

/**
 * Returns null if the version is within the accepted range, or a
 * VersionRejectedEnvelope to send back before closing the WS connection.
 */
export function checkProtocolVersion(
  protocolVersion: string
): VersionRejectedEnvelope | null {
  if (!valid(protocolVersion)) {
    return {
      type: "version_rejected",
      clientVersion: protocolVersion,
      acceptedRange: ACCEPTED_PROTOCOL_VERSION_RANGE,
      message: `"${protocolVersion}" is not a valid semver string. Run: npm i -g killswitch@latest`,
    };
  }

  if (!satisfies(protocolVersion, ACCEPTED_PROTOCOL_VERSION_RANGE)) {
    return {
      type: "version_rejected",
      clientVersion: protocolVersion,
      acceptedRange: ACCEPTED_PROTOCOL_VERSION_RANGE,
      message:
        `CLI version ${protocolVersion} is not compatible with this server.\n` +
        `Run: npm i -g killswitch@latest  then reconnect.`,
    };
  }

  return null;
}
