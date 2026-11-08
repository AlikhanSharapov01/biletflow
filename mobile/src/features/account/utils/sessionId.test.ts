import { sessionIdFromToken } from "@/features/account/utils/sessionId";

function tokenWith(claims: object): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("sessionIdFromToken", () => {
  it("reads the sid claim from the token payload", () => {
    expect(sessionIdFromToken(tokenWith({ sub: "u1", sid: "session-123" }))).toBe("session-123");
  });

  it("returns an empty string for missing or malformed tokens", () => {
    expect(sessionIdFromToken(null)).toBe("");
    expect(sessionIdFromToken("not-a-token")).toBe("");
    expect(sessionIdFromToken(tokenWith({ sub: "u1" }))).toBe("");
    expect(sessionIdFromToken(tokenWith({ sid: 42 }))).toBe("");
  });
});
