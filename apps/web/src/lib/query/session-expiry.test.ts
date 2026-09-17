import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { expireClientSession } from "./session-expiry";

describe("expireClientSession", () => {
  it("clears the query cache, redirects to login, and never writes to localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const queryClient = new QueryClient();
    queryClient.setQueryData(["auth", "me"], { id: "user-1" });
    const assign = vi.fn();

    expireClientSession(queryClient, { pathname: "/dashboard", assign });

    expect(queryClient.getQueryData(["auth", "me"])).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/login?expired=1");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("does not loop when already on the login page", () => {
    const assign = vi.fn();
    expireClientSession(new QueryClient(), { pathname: "/login", assign });
    expect(assign).not.toHaveBeenCalled();
  });
});
