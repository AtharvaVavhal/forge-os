import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OnboardingProgress } from "./onboarding-progress";

const steps = [
  { id: "welcome", label: "Welcome" },
  { id: "profile", label: "Profile" },
  { id: "work", label: "Work" },
  { id: "payout", label: "Payout" },
  { id: "review", label: "Review" },
];

describe("OnboardingProgress", () => {
  it("marks the current step and shows a functional (not just decorative) counter", () => {
    render(<OnboardingProgress steps={steps} currentIndex={2} />);

    expect(screen.getByRole("group", { name: /onboarding progress/i })).toBeInTheDocument();
    expect(screen.getByText("03 / 05")).toBeInTheDocument();
    const list = within(screen.getByRole("list"));
    const current = list.getByText("Work");
    expect(current.className).toMatch(/text-ink(?!\/)/);
  });

  it("marks steps before currentIndex as complete (checkmark) and steps after as upcoming", () => {
    render(<OnboardingProgress steps={steps} currentIndex={2} />);
    const list = within(screen.getByRole("list"));
    const marker = list.getByText("Work").closest("li")?.querySelector("[aria-current]");
    expect(marker).toHaveAttribute("aria-current", "step");
  });

  it("renders every step label", () => {
    render(<OnboardingProgress steps={steps} currentIndex={0} />);
    for (const step of steps) {
      expect(screen.getAllByText(step.label).length).toBeGreaterThan(0);
    }
  });
});
