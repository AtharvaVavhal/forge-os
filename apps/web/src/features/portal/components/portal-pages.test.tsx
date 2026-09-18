import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiClientError } from "@forge/api-client";
import { PortalOverviewPage } from "./portal-overview-page";
import { PortalProposalsPage } from "./portal-proposals-page";
import { PortalProposalDetailPage } from "./portal-proposal-detail-page";
import { PortalProjectsPage } from "./portal-projects-page";
import { PortalProjectDetailPage } from "./portal-project-detail-page";
import { PortalInvoicesPage } from "./portal-invoices-page";
import { PortalInvoiceDetailPage } from "./portal-invoice-detail-page";
import { PortalDocumentsPage } from "./portal-documents-page";
import * as portalApi from "../api/portal-api";
import { renderWithPortal } from "@/test/test-utils";
import type {
  PortalDocument,
  PortalInvoice,
  PortalMilestone,
  PortalProject,
  PortalProposal,
} from "../types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/portal",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../lib/razorpay-checkout", () => ({
  openRazorpayCheckout: vi.fn().mockResolvedValue(undefined),
}));

describe("Client Portal Pages Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. OVERVIEW PAGE
  // ==========================================
  describe("Portal Overview Page", () => {
    it("renders loading skeletons initially", () => {
      vi.spyOn(portalApi, "listPortalProjects").mockReturnValue(new Promise(() => {}));
      vi.spyOn(portalApi, "listPortalProposals").mockReturnValue(new Promise(() => {}));
      vi.spyOn(portalApi, "listPortalInvoices").mockReturnValue(new Promise(() => {}));
      vi.spyOn(portalApi, "listPortalDocuments").mockReturnValue(new Promise(() => {}));

      renderWithPortal(<PortalOverviewPage />);

      expect(screen.getByTestId("portal-projects-loading")).toBeInTheDocument();
      expect(screen.getByTestId("portal-proposals-loading")).toBeInTheDocument();
      expect(screen.getByTestId("portal-invoices-loading")).toBeInTheDocument();
      expect(screen.getByTestId("portal-documents-loading")).toBeInTheDocument();
    });

    it("renders honest empty states when datasets are empty", async () => {
      vi.spyOn(portalApi, "listPortalProjects").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
      vi.spyOn(portalApi, "listPortalProposals").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
      vi.spyOn(portalApi, "listPortalInvoices").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
      vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });

      renderWithPortal(<PortalOverviewPage />);

      expect(await screen.findByTestId("portal-projects-empty")).toHaveTextContent("No projects found for your company.");
      expect(await screen.findByTestId("portal-proposals-empty")).toHaveTextContent("No proposals found.");
      expect(await screen.findByTestId("portal-invoices-empty")).toHaveTextContent("No invoices found.");
      expect(await screen.findByTestId("portal-documents-empty")).toHaveTextContent("No documents shared with your company yet.");
    });

    it("renders honest error alerts when APIs fail and never collapses to fake zero values", async () => {
      vi.spyOn(portalApi, "listPortalProjects").mockRejectedValue(new ApiClientError(500, { code: "INTERNAL", message: "Server error", requestId: "req-1" }));
      vi.spyOn(portalApi, "listPortalProposals").mockRejectedValue(new ApiClientError(404, { code: "NOT_FOUND", message: "Not available", requestId: "req-2" }));
      vi.spyOn(portalApi, "listPortalInvoices").mockRejectedValue(new ApiClientError(503, { code: "UNAVAILABLE", message: "Service unavailable", requestId: "req-3" }));
      vi.spyOn(portalApi, "listPortalDocuments").mockRejectedValue(new ApiClientError(500, { code: "INTERNAL", message: "Error", requestId: "req-4" }));

      renderWithPortal(<PortalOverviewPage />);

      expect(await screen.findByTestId("portal-projects-error")).toHaveTextContent("Projects service is currently unavailable.");
      expect(await screen.findByTestId("portal-proposals-error")).toHaveTextContent("Proposals service is currently unavailable.");
      expect(await screen.findByTestId("portal-invoices-error")).toHaveTextContent("Invoices service is currently unavailable.");
      expect(await screen.findByTestId("portal-documents-error")).toHaveTextContent("Documents service is currently unavailable.");

      // Confirms no fake zero data was fabricated
      expect(screen.queryByText("0 projects")).not.toBeInTheDocument();
      expect(screen.queryByText("₹0")).not.toBeInTheDocument();
    });

    it("renders real composed data correctly", async () => {
      const mockProject: PortalProject = {
        id: "proj-1",
        organizationId: "org-1",
        companyId: "comp-1",
        name: "Website Redesign",
        status: "ACTIVE",
        phase: "DEVELOPMENT",
        deadline: "2026-10-01T00:00:00Z",
        completedAt: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: null,
      };

      const mockProposal: PortalProposal = {
        id: "prop-1",
        organizationId: "org-1",
        dealId: "deal-1",
        version: 2,
        status: "SENT",
        terms: "Payment on milestones",
        sentAt: "2026-09-10T00:00:00Z",
        viewedAt: null,
        acceptedAt: null,
        rejectedAt: null,
        expiresAt: "2026-09-30T00:00:00Z",
        createdAt: "2026-09-10T00:00:00Z",
        updatedAt: null,
        lineItems: [],
      };

      const mockInvoice: PortalInvoice = {
        id: "inv-1",
        organizationId: "org-1",
        companyId: "comp-1",
        invoiceNumber: "INV-2026-001",
        financialYear: "2026-2027",
        status: "SENT",
        taxTreatment: "CGST_SGST",
        billTo: null,
        amount: "50000.00",
        paidAmount: "0.00",
        pendingAmount: "50000.00",
        dueDate: "2026-10-15T00:00:00Z",
        sentAt: "2026-09-15T00:00:00Z",
        createdAt: "2026-09-15T00:00:00Z",
        updatedAt: null,
        lineItems: [],
        payments: [],
      };

      const mockDoc: PortalDocument = {
        id: "doc-1",
        title: "Master Services Agreement",
        fileName: "msa.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1048576,
        visibility: "CLIENT_VISIBLE",
        createdAt: "2026-09-01T00:00:00Z",
      };

      vi.spyOn(portalApi, "listPortalProjects").mockResolvedValue({ items: [mockProject], page: 1, pageSize: 5, total: 1 });
      vi.spyOn(portalApi, "listPortalProposals").mockResolvedValue({ items: [mockProposal], page: 1, pageSize: 5, total: 1 });
      vi.spyOn(portalApi, "listPortalInvoices").mockResolvedValue({ items: [mockInvoice], page: 1, pageSize: 5, total: 1 });
      vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({ items: [mockDoc], page: 1, pageSize: 5, total: 1 });

      renderWithPortal(<PortalOverviewPage />);

      expect(await screen.findByText("Website Redesign")).toBeInTheDocument();
      expect(screen.getByText("Proposal v2")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
      expect(screen.getByText("Master Services Agreement")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 2. PROPOSALS & ACCEPTANCE
  // ==========================================
  describe("Portal Proposals & Acceptance", () => {
    const mockProposal: PortalProposal = {
      id: "prop-100",
      organizationId: "org-1",
      dealId: "deal-1",
      version: 1,
      status: "SENT",
      terms: "Delivery in 6 weeks with two review phases.",
      sentAt: "2026-09-15T00:00:00Z",
      viewedAt: "2026-09-16T00:00:00Z",
      acceptedAt: null,
      rejectedAt: null,
      expiresAt: "2026-10-15T00:00:00Z",
      createdAt: "2026-09-15T00:00:00Z",
      updatedAt: null,
      lineItems: [
        {
          id: "li-1",
          description: "System Architecture & Design",
          quantity: "1",
          unitPrice: "75000.00",
          taxRateId: null,
          sortOrder: 1,
        },
      ],
    };

    it("renders proposal list with status badges", async () => {
      vi.spyOn(portalApi, "listPortalProposals").mockResolvedValue({
        items: [mockProposal],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithPortal(<PortalProposalsPage />);

      expect(await screen.findByText("Proposal v1")).toBeInTheDocument();
      expect(screen.getByText("Sent")).toBeInTheDocument();
      expect(screen.getByText("Review & Accept →")).toBeInTheDocument();
    });

    it("renders proposal details with terms and formatted line items", async () => {
      vi.spyOn(portalApi, "getPortalProposal").mockResolvedValue(mockProposal);

      renderWithPortal(<PortalProposalDetailPage id="prop-100" />);

      expect(await screen.findByRole("heading", { name: "Proposal v1" })).toBeInTheDocument();
      expect(screen.getByText("Delivery in 6 weeks with two review phases.")).toBeInTheDocument();
      expect(screen.getByText("System Architecture & Design")).toBeInTheDocument();
      expect(screen.getByText("₹75,000.00")).toBeInTheDocument();
      expect(screen.getByTestId("portal-accept-proposal-button")).toBeInTheDocument();
    });

    it("executes proposal acceptance flow via ConfirmationDialog and POST /portal/proposals/:id/accept", async () => {
      vi.spyOn(portalApi, "getPortalProposal").mockResolvedValue(mockProposal);
      const acceptSpy = vi.spyOn(portalApi, "acceptPortalProposal").mockResolvedValue({
        ...mockProposal,
        status: "ACCEPTED",
        acceptedAt: "2026-09-17T12:00:00Z",
      });

      renderWithPortal(<PortalProposalDetailPage id="prop-100" />);

      const acceptBtn = await screen.findByTestId("portal-accept-proposal-button");
      fireEvent.click(acceptBtn);

      // Confirmation dialog opens
      expect(screen.getByRole("heading", { name: "Accept Proposal" })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to accept Proposal v1/)).toBeInTheDocument();

      const confirmBtn = screen.getByText("Yes, Accept Proposal");
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(acceptSpy).toHaveBeenCalledWith("prop-100");
      });

      // Updated to accepted state
      expect(await screen.findByTestId("portal-proposal-accepted-badge")).toHaveTextContent("Proposal Accepted");
      expect(screen.queryByTestId("portal-accept-proposal-button")).not.toBeInTheDocument();
    });

    it("renders accepted state directly with no accept button when already accepted", async () => {
      vi.spyOn(portalApi, "getPortalProposal").mockResolvedValue({
        ...mockProposal,
        status: "ACCEPTED",
        acceptedAt: "2026-09-16T10:00:00Z",
      });

      renderWithPortal(<PortalProposalDetailPage id="prop-100" />);

      expect(await screen.findByTestId("portal-proposal-accepted-badge")).toBeInTheDocument();
      expect(screen.queryByTestId("portal-accept-proposal-button")).not.toBeInTheDocument();
    });

    it("handles 404 / unavailable proposal detail", async () => {
      vi.spyOn(portalApi, "getPortalProposal").mockRejectedValue(
        new ApiClientError(404, { code: "NOT_FOUND", message: "Proposal not found.", requestId: "req-prop" })
      );

      renderWithPortal(<PortalProposalDetailPage id="prop-missing" />);

      expect(await screen.findByTestId("portal-proposal-error")).toHaveTextContent(
        "This record doesn’t exist, or you don’t have access to it."
      );
    });
  });

  // ==========================================
  // 3. PROJECTS & MILESTONES
  // ==========================================
  describe("Portal Projects", () => {
    const mockProject: PortalProject = {
      id: "proj-10",
      organizationId: "org-1",
      companyId: "comp-1",
      name: "Mobile App MVP",
      status: "ACTIVE",
      phase: "QA",
      deadline: "2026-11-01T00:00:00Z",
      completedAt: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: null,
    };

    const mockMilestones: PortalMilestone[] = [
      {
        id: "ms-1",
        projectId: "proj-10",
        name: "User Authentication & Profiles",
        status: "COMPLETED",
        requiresClientApproval: true,
        dueDate: "2026-09-15T00:00:00Z",
        completedAt: "2026-09-14T00:00:00Z",
      },
      {
        id: "ms-2",
        projectId: "proj-10",
        name: "Payment Gateway Integration",
        status: "IN_PROGRESS",
        requiresClientApproval: false,
        dueDate: "2026-10-01T00:00:00Z",
        completedAt: null,
      },
    ];

    it("renders project list with client-visible fields only", async () => {
      vi.spyOn(portalApi, "listPortalProjects").mockResolvedValue({
        items: [mockProject],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithPortal(<PortalProjectsPage />);

      expect(await screen.findByText("Mobile App MVP")).toBeInTheDocument();
      expect(screen.getByText("QA")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("renders project details and read-only milestones", async () => {
      vi.spyOn(portalApi, "getPortalProject").mockResolvedValue(mockProject);
      vi.spyOn(portalApi, "getPortalProjectMilestones").mockResolvedValue(mockMilestones);
      vi.spyOn(portalApi, "getPortalProjectHandover").mockResolvedValue({ items: [] });

      renderWithPortal(<PortalProjectDetailPage id="proj-10" />);

      expect(await screen.findByRole("heading", { name: "Mobile App MVP" })).toBeInTheDocument();
      expect(screen.getByText("User Authentication & Profiles")).toBeInTheDocument();
      expect(screen.getByText("Payment Gateway Integration")).toBeInTheDocument();
      expect(screen.getByText("Read-only view")).toBeInTheDocument();

      // Ensure no client milestone manipulation buttons exist
      expect(screen.queryByText("Complete Milestone")).not.toBeInTheDocument();
      expect(screen.queryByText("Add Milestone")).not.toBeInTheDocument();
    });

    it("renders read-only handover checklist tab", async () => {
      vi.spyOn(portalApi, "getPortalProject").mockResolvedValue(mockProject);
      vi.spyOn(portalApi, "getPortalProjectMilestones").mockResolvedValue([]);
      vi.spyOn(portalApi, "getPortalProjectHandover").mockResolvedValue({
        items: [
          { item: "Repository Transfer", done: true, doneAt: "2026-09-16T00:00:00Z" },
          { item: "Deployment Credentials", done: false, doneAt: null },
        ],
      });

      renderWithPortal(<PortalProjectDetailPage id="proj-10" />);

      await screen.findByRole("heading", { name: "Mobile App MVP" });
      const handoverTab = screen.getByRole("tab", { name: "Handover Checklist" });
      fireEvent.click(handoverTab);

      expect(await screen.findByText("Repository Transfer")).toBeInTheDocument();
      expect(screen.getByText("Deployment Credentials")).toBeInTheDocument();
      expect(screen.getByText("Read-only summary")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 4. INVOICES & PORTAL PAYMENT
  // ==========================================
  describe("Portal Invoices & Authoritative Amounts", () => {
    const mockInvoice: PortalInvoice = {
      id: "inv-200",
      organizationId: "org-1",
      companyId: "comp-1",
      invoiceNumber: "INV-2026-0042",
      financialYear: "2026-2027",
      status: "PARTIALLY_PAID",
      taxTreatment: "CGST_SGST",
      billTo: {
        name: "Acme Enterprise Pvt Ltd",
        gstin: "27AAPCA1234A1Z5",
        billingState: "Maharashtra",
        billingAddress: "402 Silicon Towers, BKC, Mumbai",
      },
      amount: "118000.00",
      paidAmount: "59000.00",
      pendingAmount: "59000.00",
      dueDate: "2026-10-31T00:00:00Z",
      sentAt: "2026-10-01T00:00:00Z",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: null,
      lineItems: [
        {
          id: "ili-1",
          description: "Backend Cloud Infrastructure",
          hsnSacCode: "998313",
          quantity: "1",
          unitPrice: "100000.00",
          cgstRate: "9.00",
          sgstRate: "9.00",
          igstRate: null,
          lineTotal: "118000.00",
          sortOrder: 1,
        },
      ],
      payments: [
        {
          id: "pmt-1",
          amount: "59000.00",
          method: "BANK_TRANSFER",
          status: "COMPLETED",
          razorpayPaymentId: null,
          paidAt: "2026-10-05T14:30:00Z",
        },
      ],
    };

    it("renders invoice list with authoritative decimal amounts", async () => {
      vi.spyOn(portalApi, "listPortalInvoices").mockResolvedValue({
        items: [mockInvoice],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithPortal(<PortalInvoicesPage />);

      expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
      expect(screen.getByText("Partially Paid")).toBeInTheDocument();
      expect(screen.getByText("₹1,18,000.00")).toBeInTheDocument();
      expect(screen.getByText("₹59,000.00")).toBeInTheDocument();
    });

    it("renders invoice details with bill-to snapshot, taxes, and recorded payments", async () => {
      vi.spyOn(portalApi, "getPortalInvoice").mockResolvedValue(mockInvoice);

      renderWithPortal(<PortalInvoiceDetailPage id="inv-200" />);

      expect(await screen.findByRole("heading", { name: "INV-2026-0042" })).toBeInTheDocument();
      expect(screen.getByText("Acme Enterprise Pvt Ltd")).toBeInTheDocument();
      expect(screen.getByText("GSTIN: 27AAPCA1234A1Z5")).toBeInTheDocument();
      expect(screen.getByText("402 Silicon Towers, BKC, Mumbai")).toBeInTheDocument();
      expect(screen.getByText("Backend Cloud Infrastructure")).toBeInTheDocument();
      expect(screen.getByText("998313")).toBeInTheDocument();
      expect(screen.getByText("₹1,00,000.00")).toBeInTheDocument();
      expect(screen.getByText("Recorded Payments")).toBeInTheDocument();
      expect(screen.getByText("BANK_TRANSFER")).toBeInTheDocument();
    });

    it("shows outstanding amount and Pay now for payable invoices", async () => {
      vi.spyOn(portalApi, "getPortalInvoice").mockResolvedValue(mockInvoice);
      const paySpy = vi.spyOn(portalApi, "payPortalInvoice").mockResolvedValue({
        orderId: "order_test",
        amount: "59000.00",
        currency: "INR",
        keyId: "rzp_test_key",
        paymentId: "pay-pending-1",
      });

      renderWithPortal(<PortalInvoiceDetailPage id="inv-200" />);

      expect(await screen.findByTestId("portal-invoice-pay-button")).toBeInTheDocument();
      expect(screen.getByText(/Outstanding:/i)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("portal-invoice-pay-button"));
      await waitFor(() => {
        expect(paySpy).toHaveBeenCalledWith("inv-200");
      });
      // Card/UPI fields are never rendered in FORGE — Razorpay Checkout owns that UI.
      expect(screen.queryByPlaceholderText(/card/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/upi/i)).not.toBeInTheDocument();
    });

    it("polls invoice detail after checkout success until PAID without marking paid client-side", async () => {
      const checkout = await import("../lib/razorpay-checkout");
      vi.mocked(checkout.openRazorpayCheckout).mockImplementation(async (_order, opts) => {
        opts.onSuccess?.();
      });

      let paid = false;
      vi.spyOn(portalApi, "getPortalInvoice").mockImplementation(async () =>
        paid
          ? {
              ...mockInvoice,
              status: "PAID",
              paidAmount: "118000.00",
              pendingAmount: "0.00",
            }
          : mockInvoice
      );
      vi.spyOn(portalApi, "payPortalInvoice").mockResolvedValue({
        orderId: "order_test",
        amount: "59000.00",
        currency: "INR",
        keyId: "rzp_test_key",
        paymentId: "pay-pending-1",
      });

      renderWithPortal(<PortalInvoiceDetailPage id="inv-200" />);
      fireEvent.click(await screen.findByTestId("portal-invoice-pay-button"));

      expect(await screen.findByTestId("portal-invoice-payment-processing")).toHaveTextContent(
        /Waiting for gateway confirmation/i
      );
      expect(screen.getByTestId("portal-invoice-pay-button")).toBeDisabled();

      paid = true;
      await waitFor(
        () => {
          expect(screen.getByTestId("portal-invoice-paid")).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
      expect(screen.queryByTestId("portal-invoice-pay-button")).not.toBeInTheDocument();
    });

    it("shows already-paid state without a pay action", async () => {
      vi.spyOn(portalApi, "getPortalInvoice").mockResolvedValue({
        ...mockInvoice,
        status: "PAID",
        paidAmount: "118000.00",
        pendingAmount: "0.00",
        payments: mockInvoice.payments,
      });

      renderWithPortal(<PortalInvoiceDetailPage id="inv-200" />);

      expect(await screen.findByTestId("portal-invoice-paid")).toHaveTextContent("fully paid");
      expect(screen.queryByTestId("portal-invoice-pay-button")).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // 5. SUPPORT TICKETS
  // ==========================================
  describe("Portal Support", () => {
    it("lists tickets and creates a new company-scoped ticket", async () => {
      const user = userEvent.setup();
      const listSpy = vi.spyOn(portalApi, "listPortalSupportTickets").mockResolvedValue({
        items: [
          {
            id: "tkt-1",
            subject: "Milestone clarification",
            status: "OPEN",
            projectId: "proj-10",
            raisedByClientUserId: "client-1",
            resolvedAt: null,
            createdAt: "2026-09-18T00:00:00Z",
            updatedAt: null,
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      });
      vi.spyOn(portalApi, "listPortalProjects").mockResolvedValue({
        items: [
          {
            id: "proj-10",
            organizationId: "org-1",
            companyId: "comp-1",
            name: "Mobile App MVP",
            status: "ACTIVE",
            phase: "QA",
            deadline: null,
            completedAt: null,
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: null,
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      });
      const createSpy = vi.spyOn(portalApi, "createPortalSupportTicket").mockResolvedValue({
        id: "tkt-2",
        subject: "Need invoice copy",
        status: "OPEN",
        projectId: "proj-10",
        raisedByClientUserId: "client-1",
        resolvedAt: null,
        createdAt: "2026-09-18T12:00:00Z",
        updatedAt: null,
      });

      const { PortalSupportPage } = await import("./portal-support-page");
      renderWithPortal(<PortalSupportPage />);

      expect(await screen.findByText("Milestone clarification")).toBeInTheDocument();
      expect(listSpy).toHaveBeenCalled();

      await user.click(screen.getByTestId("portal-support-create"));
      await screen.findByRole("option", { name: "Mobile App MVP" });
      await user.selectOptions(screen.getByLabelText(/^Project/), "proj-10");
      await user.type(screen.getByLabelText(/^Subject/), "Need invoice copy");
      await user.click(screen.getByRole("button", { name: "Create ticket" }));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          projectId: "proj-10",
          subject: "Need invoice copy",
        });
      });
      expect(await screen.findByTestId("portal-support-detail")).toHaveTextContent("Need invoice copy");
    });
  });

  // ==========================================
  // 6. DOCUMENTS & DOWNLOADS
  // ==========================================
  describe("Portal Documents", () => {
    const mockDoc: PortalDocument = {
      id: "doc-50",
      title: "Security & Compliance Audit",
      fileName: "compliance_audit.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 2097152,
      visibility: "CLIENT_VISIBLE",
      createdAt: "2026-09-12T00:00:00Z",
    };

    it("renders document list with file details and download button", async () => {
      vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({
        items: [mockDoc],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithPortal(<PortalDocumentsPage />);

      expect(await screen.findByText("Security & Compliance Audit")).toBeInTheDocument();
      expect(screen.getByText("compliance_audit.pdf")).toBeInTheDocument();
      expect(screen.getByText("2.0 MB")).toBeInTheDocument();
      expect(screen.getByTestId("portal-document-download-doc-50")).toBeInTheDocument();
    });

    it("retrieves signed download URL when Download is clicked and opens in new window", async () => {
      vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({
        items: [mockDoc],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      const downloadSpy = vi.spyOn(portalApi, "getPortalDocumentDownloadUrl").mockResolvedValue({
        url: "https://storage.forgebuilds.in/signed/doc-50?token=xyz",
        expiresInSeconds: 300,
      });

      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

      renderWithPortal(<PortalDocumentsPage />);

      const downloadBtn = await screen.findByTestId("portal-document-download-doc-50");
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalledWith("doc-50");
        expect(openSpy).toHaveBeenCalledWith(
          "https://storage.forgebuilds.in/signed/doc-50?token=xyz",
          "_blank",
          "noopener,noreferrer"
        );
      });
    });

    it("strictly provides no upload form or upload button in portal", async () => {
      vi.spyOn(portalApi, "listPortalDocuments").mockResolvedValue({
        items: [mockDoc],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithPortal(<PortalDocumentsPage />);

      await screen.findByText("Security & Compliance Audit");

      expect(screen.queryByText("Upload Document")).not.toBeInTheDocument();
      expect(screen.queryByText("Upload")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/choose file/i)).not.toBeInTheDocument();
    });
  });
});
