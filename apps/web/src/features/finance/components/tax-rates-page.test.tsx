import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaxRatesPage } from "./tax-rates-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { TaxRate } from "../api/types";

vi.mock("../api/finance-api", () => ({
  listTaxRates: vi.fn(),
  createTaxRate: vi.fn(),
  updateTaxRate: vi.fn(),
}));

import { createTaxRate, listTaxRates, updateTaxRate } from "../api/finance-api";

const rate: TaxRate = {
  id: "tax-1",
  organizationId: "org-1",
  hsnSacCode: "998314",
  description: "IT design",
  cgstRate: "9.00",
  sgstRate: "9.00",
  igstRate: "18.00",
  effectiveFrom: "2026-04-01T00:00:00.000Z",
  effectiveTo: null,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const manage = createAuthContext({
  role: "FINANCE",
  permissions: ["finance.read", "finance.manage"],
});

async function fillCreateForm(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    hsn?: string;
    description?: string;
    cgst?: string;
    sgst?: string;
    igst?: string;
    from?: string;
  }
) {
  if (values.hsn !== undefined) {
    await user.clear(screen.getByLabelText(/hsn\/sac/i));
    await user.type(screen.getByLabelText(/hsn\/sac/i), values.hsn);
  }
  if (values.description !== undefined) {
    await user.clear(screen.getByLabelText(/^description/i));
    await user.type(screen.getByLabelText(/^description/i), values.description);
  }
  if (values.cgst !== undefined) {
    await user.clear(screen.getByLabelText(/cgst/i));
    await user.type(screen.getByLabelText(/cgst/i), values.cgst);
  }
  if (values.sgst !== undefined) {
    await user.clear(screen.getByLabelText(/sgst/i));
    await user.type(screen.getByLabelText(/sgst/i), values.sgst);
  }
  if (values.igst !== undefined) {
    await user.clear(screen.getByLabelText(/igst/i));
    await user.type(screen.getByLabelText(/igst/i), values.igst);
  }
  if (values.from !== undefined) {
    await user.clear(screen.getByLabelText(/effective from/i));
    await user.type(screen.getByLabelText(/effective from/i), values.from);
  }
}

describe("Tax rates page", () => {
  beforeEach(() => {
    vi.mocked(listTaxRates).mockResolvedValue({ items: [rate], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createTaxRate).mockReset();
    vi.mocked(updateTaxRate).mockReset();
  });

  it("renders loading state", () => {
    vi.mocked(listTaxRates).mockReturnValue(new Promise(() => {}));
    renderWithShell(<TaxRatesPage />, manage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("renders empty state", async () => {
    vi.mocked(listTaxRates).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<TaxRatesPage />, manage);
    expect(await screen.findByText("No tax rates")).toBeInTheDocument();
  });

  it("lists tax rates", async () => {
    renderWithShell(<TaxRatesPage />, manage);
    expect(await screen.findByText("998314")).toBeInTheDocument();
    expect(screen.getByText("IT design")).toBeInTheDocument();
    expect(screen.getAllByText("9.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("18.00")).toBeInTheDocument();
  });

  it("rejects invalid rate formats before API submission", async () => {
    const user = userEvent.setup();
    renderWithShell(<TaxRatesPage />, manage);
    await user.click(await screen.findByRole("button", { name: "New tax rate" }));

    const invalidRates = ["18", "18.5", "18.000", "abc", "-5.00"];
    for (const bad of invalidRates) {
      await fillCreateForm(user, {
        hsn: "998314",
        description: "Services",
        cgst: bad,
        sgst: "9.00",
        igst: "18.00",
        from: "2026-04-01",
      });
      await user.click(screen.getByRole("button", { name: "Create tax rate" }));
      expect(await screen.findByTestId("tax-rate-validation-error")).toHaveTextContent(
        /exactly two decimal places/i
      );
      expect(createTaxRate).not.toHaveBeenCalled();
      vi.mocked(createTaxRate).mockClear();
    }
  });

  it("accepts valid rate format and creates", async () => {
    const user = userEvent.setup();
    vi.mocked(createTaxRate).mockResolvedValue({
      ...rate,
      id: "tax-2",
      hsnSacCode: "998399",
      cgstRate: "0.00",
      sgstRate: "5.00",
      igstRate: "100.00",
    });
    renderWithShell(<TaxRatesPage />, manage);
    await user.click(await screen.findByRole("button", { name: "New tax rate" }));
    await fillCreateForm(user, {
      hsn: "998399",
      description: "Consulting",
      cgst: "0.00",
      sgst: "5.00",
      igst: "100.00",
      from: "2026-04-01",
    });
    await user.click(screen.getByRole("button", { name: "Create tax rate" }));
    await waitFor(() =>
      expect(createTaxRate).toHaveBeenCalledWith(
        expect.objectContaining({
          hsnSacCode: "998399",
          description: "Consulting",
          cgstRate: "0.00",
          sgstRate: "5.00",
          igstRate: "100.00",
          effectiveFrom: "2026-04-01",
        })
      )
    );
  });

  it("edits an existing tax rate", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTaxRate).mockResolvedValue({ ...rate, description: "IT design updated" });
    renderWithShell(<TaxRatesPage />, manage);
    await screen.findByText("998314");
    await user.click(screen.getByRole("button", { name: "Actions for 998314" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const description = screen.getByLabelText(/^description/i);
    await user.clear(description);
    await user.type(description, "IT design updated");
    await user.click(screen.getByRole("button", { name: "Save tax rate" }));
    await waitFor(() =>
      expect(updateTaxRate).toHaveBeenCalledWith(
        "tax-1",
        expect.objectContaining({
          description: "IT design updated",
          cgstRate: "9.00",
          sgstRate: "9.00",
          igstRate: "18.00",
        })
      )
    );
  });

  it("shows validation error on edit with invalid rate", async () => {
    const user = userEvent.setup();
    renderWithShell(<TaxRatesPage />, manage);
    await screen.findByText("998314");
    await user.click(screen.getByRole("button", { name: "Actions for 998314" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const cgst = screen.getByLabelText(/cgst/i);
    await user.clear(cgst);
    await user.type(cgst, "18");
    await user.click(screen.getByRole("button", { name: "Save tax rate" }));
    expect(await screen.findByTestId("tax-rate-validation-error")).toBeInTheDocument();
    expect(updateTaxRate).not.toHaveBeenCalled();
  });

  it("surfaces API create errors", async () => {
    const user = userEvent.setup();
    vi.mocked(createTaxRate).mockRejectedValue(
      new ApiClientError(409, {
        code: "CONFLICT",
        message: "HSN/SAC already exists for this period.",
        requestId: "r1",
      })
    );
    renderWithShell(<TaxRatesPage />, manage);
    await user.click(await screen.findByRole("button", { name: "New tax rate" }));
    await fillCreateForm(user, {
      hsn: "998314",
      description: "Dup",
      cgst: "9.00",
      sgst: "9.00",
      igst: "18.00",
      from: "2026-04-01",
    });
    await user.click(screen.getByRole("button", { name: "Create tax rate" }));
    expect(await screen.findByText(/couldn’t create tax rate/i)).toBeInTheDocument();
  });

  it("surfaces list API errors", async () => {
    vi.mocked(listTaxRates).mockRejectedValue(
      new ApiClientError(500, { code: "INTERNAL", message: "Server error", requestId: "r2" })
    );
    renderWithShell(<TaxRatesPage />, manage);
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
  });
});
