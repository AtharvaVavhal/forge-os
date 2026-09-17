import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowActions,
} from "./table";
import { Pagination } from "./pagination";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/icons";

describe("Table", () => {
  it("requires a caption and renders sortable headers", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <Table caption="Companies">
        <TableHead>
          <TableHeaderCell sorted="none" onSort={onSort}>
            Name
          </TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Forge</TableCell>
            <TableCell>Active</TableCell>
            <TableRowActions>
              <Dropdown
                trigger={({ open, setOpen, triggerId, menuId }) => (
                  <IconButton
                    id={triggerId}
                    label="Row actions"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={menuId}
                    onClick={() => setOpen(!open)}
                  >
                    <IconMore size={16} />
                  </IconButton>
                )}
              >
                <DropdownItem onSelect={() => undefined}>Open</DropdownItem>
              </Dropdown>
            </TableRowActions>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole("table", { name: "Companies" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(onSort).toHaveBeenCalled();
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "none");
  });

  it("paginates", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={4} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
