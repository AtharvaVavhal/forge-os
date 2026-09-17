import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PortalShell } from "./portal-shell";
import { PortalOverviewPage } from "./portal-overview-page";
import { PortalInvoiceDetailPage } from "./portal-invoice-detail-page";
import { PortalProjectDetailPage } from "./portal-project-detail-page";
import { renderWithPortal, createPortalAuthContext } from "@/test/test-utils";
import * as portalApi from "../api/portal-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/portal",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Client Portal Security & Boundary Guarantees (Section 29)", () => {
  it("does NOT expose internal workspace navigation destinations to ClientUsers", () => {
    const authContext = createPortalAuthContext({
      email: "client@acme.com",
      company: { id: "company-1", name: "Acme Corp" },
    });

    renderWithPortal(
      <PortalShell>
        <div>Client Content</div>
      </PortalShell>,
      authContext
    );

    // Internal navigation links must NOT be present
    expect(screen.queryByText("CRM")).not.toBeInTheDocument();
    expect(screen.queryByText("Deals")).not.toBeInTheDocument();
    expect(screen.queryByText("Leads")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
    expect(screen.queryByText("Forge Fund")).not.toBeInTheDocument();
    expect(screen.queryByText("Team")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Log")).not.toBeInTheDocument();

    // Verify hrefs do not point to internal workspace paths
    const links = screen.getAllByRole("link");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) {
        expect(href.startsWith("/portal")).toBe(true);
      }
    }
  });

  it("does NOT expose internal notes or internal activity records", async () => {
    vi.spyOn(portalApi, "getPortalProject").mockResolvedValue({
      id: "proj-1",
      organizationId: "org-1",
      companyId: "comp-1",
      name: "Security Audited Project",
      status: "ACTIVE",
      phase: "DEVELOPMENT",
      deadline: null,
      completedAt: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: null,
    });
    vi.spyOn(portalApi, "getPortalProjectMilestones").mockResolvedValue([]);
    vi.spyOn(portalApi, "getPortalProjectHandover").mockResolvedValue({ items: [] });

    renderWithPortal(<PortalProjectDetailPage id="proj-1" />);

    await screen.findByRole("heading", { name: "Security Audited Project" });

    // Must not contain Notes panel or Activity timeline
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Note")).not.toBeInTheDocument();
    expect(screen.queryByText("Log Activity")).not.toBeInTheDocument();
  });

  it("does NOT expose internal team member assignments, time entries, or staff rates", async () => {
    vi.spyOn(portalApi, "getPortalProject").mockResolvedValue({
      id: "proj-1",
      organizationId: "org-1",
      companyId: "comp-1",
      name: "Client Visible Project",
      status: "ACTIVE",
      phase: "QA",
      deadline: null,
      completedAt: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: null,
    });
    vi.spyOn(portalApi, "getPortalProjectMilestones").mockResolvedValue([]);
    vi.spyOn(portalApi, "getPortalProjectHandover").mockResolvedValue({ items: [] });

    renderWithPortal(<PortalProjectDetailPage id="proj-1" />);

    await screen.findByRole("heading", { name: "Client Visible Project" });

    expect(screen.queryByText("Team Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Time Entries")).not.toBeInTheDocument();
    expect(screen.queryByText("Hourly Rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Logged Hours")).not.toBeInTheDocument();
  });

  it("does NOT expose storage credentials or R2 secrets in DOM", async () => {
    vi.spyOn(portalApi, "listPortalProjects").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    vi.spyOn(portalApi, "listPortalProposals").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    vi.spyOn(portalApi, "listPortalInvoices").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({
      items: [
        {
          id: "doc-1",
          title: "Architecture Spec",
          fileName: "arch.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1024,
          visibility: "CLIENT_VISIBLE",
          createdAt: "2026-09-01T00:00:00Z",
        },
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });

    const { container } = renderWithPortal(<PortalOverviewPage />);

    await screen.findByText("Architecture Spec");

    const html = container.innerHTML;
    expect(html).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(html).not.toContain("R2_SECRET");
    expect(html).not.toContain("secret_key");
    expect(html).not.toContain("CLOUDFLARE");
  });

  it("does NOT expose Razorpay payment keys or checkout scripts in the portal UI", async () => {
    vi.spyOn(portalApi, "getPortalInvoice").mockResolvedValue({
      id: "inv-1",
      organizationId: "org-1",
      companyId: "comp-1",
      invoiceNumber: "INV-001",
      financialYear: "2026-2027",
      status: "SENT",
      taxTreatment: "CGST_SGST",
      billTo: null,
      amount: "10000.00",
      paidAmount: "0.00",
      pendingAmount: "10000.00",
      dueDate: "2026-10-15T00:00:00Z",
      sentAt: "2026-09-15T00:00:00Z",
      createdAt: "2026-09-15T00:00:00Z",
      updatedAt: null,
      lineItems: [],
      payments: [],
    });

    const { container } = renderWithPortal(<PortalInvoiceDetailPage id="inv-1" />);

    await screen.findByRole("heading", { name: "INV-001" });

    const html = container.innerHTML;
    expect(html).not.toContain("rzp_test_");
    expect(html).not.toContain("rzp_live_");
    expect(html).not.toContain("checkout.razorpay.com");
    expect(html).not.toContain("Razorpay");
  });
});
