import { describe, it, expect } from "vitest";
import {
  checkProtocolVersion,
  ACCEPTED_PROTOCOL_VERSION_RANGE,
} from "./version-handshake";

describe("checkProtocolVersion", () => {
  it("accepts a version within the range", () => {
    expect(checkProtocolVersion({ protocolVersion: "0.1.0" })).toBeNull();
    expect(checkProtocolVersion({ protocolVersion: "1.5.3" })).toBeNull();
    expect(checkProtocolVersion({ protocolVersion: "1.99.0" })).toBeNull();
  });

  it("rejects versions below the range", () => {
    const result = checkProtocolVersion({ protocolVersion: "0.0.9" });
    expect(result).not.toBeNull();
    expect(result?.type).toBe("version_rejected");
    expect(result?.message).toMatch(/npm i -g killswitch@latest/);
    expect(result?.acceptedRange).toBe(ACCEPTED_PROTOCOL_VERSION_RANGE);
  });

  it("rejects versions at or above the upper bound", () => {
    const result = checkProtocolVersion({ protocolVersion: "2.0.0" });
    expect(result).not.toBeNull();
    expect(result?.type).toBe("version_rejected");
  });

  it("rejects non-semver strings", () => {
    const result = checkProtocolVersion({ protocolVersion: "not-a-version" });
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/not a valid semver/);
  });

  it("includes the client version in the rejection frame", () => {
    const result = checkProtocolVersion({ protocolVersion: "99.0.0" });
    expect(result?.clientVersion).toBe("99.0.0");
  });
});
