import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/test-utils";
import { BankCombobox } from "./bank-combobox";

vi.mock("@/features/shared/api/bank-directory-api", () => ({
  searchBanks: vi.fn(),
}));

import { searchBanks } from "@/features/shared/api/bank-directory-api";

const mockSearchBanks = vi.mocked(searchBanks);

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <BankCombobox id="bankName" name="bankName" value={value} onChange={setValue} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchBanks.mockResolvedValue([]);
});

describe("BankCombobox", () => {
  it("shows a hint instead of searching below the 2-character minimum", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "h");

    expect(await screen.findByText(/type at least 2 characters/i)).toBeInTheDocument();
    expect(mockSearchBanks).not.toHaveBeenCalled();
  });

  it("debounces and searches once 2+ characters settle", async () => {
    mockSearchBanks.mockResolvedValue([{ id: "HDFC", bankName: "HDFC BANK", bankCode: "HDFC" }]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "hdfc");

    await waitFor(() => expect(mockSearchBanks).toHaveBeenCalledWith("hdfc"));
    expect(await screen.findByRole("option", { name: "HDFC BANK" })).toBeInTheDocument();
  });

  it("shows a loading state while the search is in flight", async () => {
    let resolveSearch: (value: { id: string; bankName: string; bankCode: string }[]) => void = () => {};
    mockSearchBanks.mockImplementation(
      () => new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "hdfc");

    expect(await screen.findByText(/searching/i)).toBeInTheDocument();
    resolveSearch([{ id: "HDFC", bankName: "HDFC BANK", bankCode: "HDFC" }]);
    expect(await screen.findByRole("option", { name: "HDFC BANK" })).toBeInTheDocument();
  });

  it("shows a no-results state", async () => {
    mockSearchBanks.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "zzzznotabank");

    expect(await screen.findByText(/no matching banks/i)).toBeInTheDocument();
  });

  it("shows an error state without crashing", async () => {
    mockSearchBanks.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "hdfc");

    expect(await screen.findByText(/couldn.t search banks/i)).toBeInTheDocument();
  });

  it("selects a result by click, filling the input and closing the panel", async () => {
    mockSearchBanks.mockResolvedValue([{ id: "HDFC", bankName: "HDFC BANK", bankCode: "HDFC" }]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "hdfc");

    const option = await screen.findByRole("option", { name: "HDFC BANK" });
    await user.click(option);

    expect(input).toHaveValue("HDFC BANK");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("supports ArrowDown/ArrowUp/Enter keyboard selection", async () => {
    mockSearchBanks.mockResolvedValue([
      { id: "AAAA", bankName: "AAA BANK", bankCode: "AAAA" },
      { id: "BBBB", bankName: "BBB BANK", bankCode: "BBBB" },
    ]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "bank");

    // activeIndex starts at 0 (AAA BANK) — one ArrowDown moves to BBB BANK.
    await screen.findByRole("option", { name: "AAA BANK" });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(input).toHaveValue("BBB BANK");
  });

  it("closes the panel on Escape without clearing the typed value", async () => {
    mockSearchBanks.mockResolvedValue([{ id: "HDFC", bankName: "HDFC BANK", bankCode: "HDFC" }]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "hdfc");
    await screen.findByRole("option", { name: "HDFC BANK" });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("hdfc");
  });

  it("opens on focus/click even before typing", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText(/type a bank name to search/i)).toBeInTheDocument();
  });

  it("is keyboard/screen-reader accessible via combobox ARIA wiring", async () => {
    mockSearchBanks.mockResolvedValue([{ id: "HDFC", bankName: "HDFC BANK", bankCode: "HDFC" }]);
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "hdfc");
    await screen.findByRole("option", { name: "HDFC BANK" });

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
  });
});
