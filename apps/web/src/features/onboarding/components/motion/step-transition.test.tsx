import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepTransition } from "./step-transition";

function mockReducedMotion(matches: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  mockReducedMotion(false);
});

describe("StepTransition", () => {
  it("renders the initial step immediately", () => {
    mockReducedMotion(false);
    render(
      <StepTransition stepKey="a">
        <p>Step A</p>
      </StepTransition>
    );
    expect(screen.getByText("Step A")).toBeInTheDocument();
  });

  it("freezes the outgoing step until its exit animation ends, then swaps to the new one", () => {
    mockReducedMotion(false);
    const { rerender, container } = render(
      <StepTransition stepKey="a">
        <p>Step A</p>
      </StepTransition>
    );

    rerender(
      <StepTransition stepKey="b">
        <p>Step B</p>
      </StepTransition>
    );

    // Never a hole: the outgoing step's content stays on screen mid-exit.
    expect(screen.getByText("Step A")).toBeInTheDocument();
    expect(screen.queryByText("Step B")).not.toBeInTheDocument();

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toMatch(/forge-onboard-exit/);
    fireEvent.animationEnd(wrapper);

    expect(screen.getByText("Step B")).toBeInTheDocument();
    expect(screen.queryByText("Step A")).not.toBeInTheDocument();
  });

  it("swaps instantly under prefers-reduced-motion — never just a faster version of the same animation", () => {
    mockReducedMotion(true);
    const { rerender, container } = render(
      <StepTransition stepKey="a">
        <p>Step A</p>
      </StepTransition>
    );

    rerender(
      <StepTransition stepKey="b">
        <p>Step B</p>
      </StepTransition>
    );

    expect(screen.getByText("Step B")).toBeInTheDocument();
    expect(screen.queryByText("Step A")).not.toBeInTheDocument();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/forge-onboard-exit/);
  });

  it("does not re-animate when the same stepKey re-renders (e.g. a validation error appearing)", () => {
    mockReducedMotion(false);
    const { rerender } = render(
      <StepTransition stepKey="a">
        <p>Step A</p>
      </StepTransition>
    );

    rerender(
      <StepTransition stepKey="a">
        <p>Step A</p>
        <p role="alert">Something went wrong.</p>
      </StepTransition>
    );

    expect(screen.getByText("Step A")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
