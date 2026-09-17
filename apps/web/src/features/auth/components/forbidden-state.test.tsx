import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForbiddenState } from "./forbidden-state";
import { ForbiddenAlert } from "./forbidden-alert";

describe("403 handling", () => {
  it("renders a non-enumerating unavailable page", () => {
    render(<ForbiddenState />);

    expect(
      screen.getByRole("heading", {
        name: "This page doesn’t exist, or you don’t have access to it.",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("renders an inline permission alert for unexpected 403s", () => {
    render(<ForbiddenAlert />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
  });
});
