// Step 3a — Server-side version handshake
//
// Called at WS connect before the slot-key handshake.
// If the CLI's protocolVersion is outside ACCEPTED_RANGE, the connection
// is refused with a structured error frame so the CLI can print it in
// the terminal and exit cleanly.
//
// The backend ticket owns the CLI side (sending protocolVersion at connect);
// this module owns the range definition and rejection contract.

import { satisfies, valid } from "semver";

/**
 * The semver range the server accepts.
 *
 * Bump this when a breaking WS protocol change ships.
 * Keep it in lockstep with the published CLI versions that implement the
 * current protocol — i.e. widen it as backward-compatible CLI builds ship,
 * narrow it to force upgrades after a breaking change.
 */
export const ACCEPTED_PROTOCOL_VERSION_RANGE = ">=0.1.0 <2.0.0";

export interface VersionHandshakeFrame {
  type: "connect";
  protocolVersion: string;
  slotKey: string;
}

export interface VersionRejectedFrame {
  type: "version_rejected";
  clientVersion: string;
  acceptedRange: string;
  message: string;
}

/**
 * Returns null if the version is accepted, or a VersionRejectedFrame to
 * send back to the CLI before closing the connection.
 */
export function checkProtocolVersion(
  frame: Pick<VersionHandshakeFrame, "protocolVersion">
): VersionRejectedFrame | null {
  const v = frame.protocolVersion;

  if (!valid(v)) {
    return buildRejection(v, `"${v}" is not a valid semver string`);
  }

  if (!satisfies(v, ACCEPTED_PROTOCOL_VERSION_RANGE)) {
    return buildRejection(
      v,
      `CLI version ${v} is not compatible with this server.\n` +
        `Run: npm i -g killswitch@latest  then reconnect.`
    );
  }

  return null;
}

function buildRejection(
  clientVersion: string,
  message: string
): VersionRejectedFrame {
  return {
    type: "version_rejected",
    clientVersion,
    acceptedRange: ACCEPTED_PROTOCOL_VERSION_RANGE,
    message,
  };
}
