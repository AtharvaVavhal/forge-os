import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, DropdownItem } from "./dropdown";

describe("Dropdown", () => {
  it("opens a menu and selects an item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Dropdown
        trigger={({ open, setOpen, triggerId, menuId }) => (
          <button
            id={triggerId}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
          >
            Row actions
          </button>
        )}
      >
        <DropdownItem onSelect={onSelect}>Edit</DropdownItem>
      </Dropdown>
    );

    await user.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalled();
  });
});
