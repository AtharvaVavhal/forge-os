import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Can } from "./can";
import { createAuthContext, renderWithAuth } from "@/test/test-utils";

describe("Can", () => {
  it("hides children the current role cannot use", () => {
    renderWithAuth(
      <Can role="FOUNDER_ADMIN">
        <button type="button">Invite member</button>
      </Can>,
      createAuthContext({ role: "TEAM_MEMBER" })
    );

    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("renders children for an allowed role", () => {
    renderWithAuth(
      <Can role={["FOUNDER_ADMIN", "FINANCE"]}>
        <button type="button">Record payment</button>
      </Can>,
      createAuthContext({ role: "FINANCE" })
    );

    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
  });

  it("can disable instead of hiding via a render prop", () => {
    renderWithAuth(
      <Can permission="finance.manage">
        {({ allowed }) => (
          <button type="button" disabled={!allowed}>
            Create invoice
          </button>
        )}
      </Can>,
      createAuthContext({ permissions: undefined })
    );

    expect(screen.getByRole("button", { name: "Create invoice" })).toBeDisabled();
  });
});
