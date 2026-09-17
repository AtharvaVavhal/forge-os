import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorState, LoadingState, TableEmptyState, TableLoadingState } from "./data-states";

describe("data display states", () => {
  it("renders an empty state", () => {
    render(<EmptyState kicker="CRM" title="No leads yet" description="Create a lead to begin." />);
    expect(screen.getByRole("heading", { name: "No leads yet" })).toBeInTheDocument();
  });

  it("renders table empty and loading states", () => {
    const { rerender } = render(<TableEmptyState title="No rows" description="Nothing matched." />);
    expect(screen.getByRole("heading", { name: "No rows" })).toBeInTheDocument();

    rerender(<TableLoadingState rows={3} />);
    expect(screen.getByRole("status", { name: "Loading rows" })).toBeInTheDocument();
  });

  it("renders loading and error states", () => {
    const { rerender } = render(<LoadingState label="Loading dashboard" />);
    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();

    rerender(<ErrorState title="Couldn’t load this view">Network unavailable.</ErrorState>);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this view");
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable.");
  });
});
