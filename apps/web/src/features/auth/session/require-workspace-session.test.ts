import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthReadResult } from "./read-session";

vi.mock("./read-session", () => ({
  readAuthContext: vi.fn(),
}));

import { readAuthContext } from "./read-session";
import { redirectIfAuthenticated, requireWorkspaceSession } from "./require-workspace-session";
import { createAuthContext } from "@/test/test-utils";

const mockRead = vi.mocked(readAuthContext);

describe("workspace auth boundary", () => {
  beforeEach(() => {
    mockRead.mockReset();
  });

  it("redirects unauthenticated users to /login", async () => {
    mockRead.mockResolvedValue({ status: "unauthenticated" } satisfies AuthReadResult);

    await expect(requireWorkspaceSession()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the session for an authenticated user", async () => {
    const context = createAuthContext({ role: "OPERATIONS" });
    mockRead.mockResolvedValue({ status: "authenticated", context });

    await expect(requireWorkspaceSession()).resolves.toEqual(context);
  });

  it("surfaces an unavailable auth service instead of inventing a session", async () => {
    mockRead.mockResolvedValue({
      status: "unavailable",
      error: new Error("Authentication service is unavailable."),
    });

    await expect(requireWorkspaceSession()).rejects.toThrow("Authentication service is unavailable.");
  });

  it("sends already-authenticated visitors from login to /dashboard", async () => {
    mockRead.mockResolvedValue({
      status: "authenticated",
      context: createAuthContext(),
    });

    await expect(redirectIfAuthenticated()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("does not redirect guests away from login", async () => {
    mockRead.mockResolvedValue({ status: "unauthenticated" });
    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
  });
});
