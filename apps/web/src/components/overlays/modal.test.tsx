import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Modal } from "./modal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Archive record">
        <p>This cannot be undone from this phase.</p>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("opens with dialog semantics and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    const dialog = await screen.findByRole("dialog", { name: "Archive record" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("traps tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Focus trap">
        <button type="button">Inside</button>
      </Modal>
    );

    const dialog = await screen.findByRole("dialog", { name: "Focus trap" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
