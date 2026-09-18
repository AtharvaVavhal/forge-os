import type { PortalPayOrder } from "../types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-forge-razorpay="checkout"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.forgeRazorpay = "checkout";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay Checkout for a portal pay order.
 * Payment completion is webhook-authoritative — success here only means the
 * gateway accepted the attempt; the UI should refresh the invoice afterward.
 */
export async function openRazorpayCheckout(
  order: PortalPayOrder,
  opts: {
    description: string;
    onDismiss?: () => void;
    onSuccess?: () => void;
    onFailure?: (reason: string) => void;
  }
): Promise<void> {
  const ready = await loadRazorpayCheckoutScript();
  if (!ready || !window.Razorpay) {
    opts.onFailure?.("Payment checkout could not be loaded. Try again later.");
    return;
  }

  const amountPaise = Math.round(Number.parseFloat(order.amount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    opts.onFailure?.("Invalid payment amount from the server.");
    return;
  }

  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: amountPaise,
    currency: order.currency || "INR",
    name: "FORGE",
    description: opts.description,
    order_id: order.orderId,
    handler: () => {
      opts.onSuccess?.();
    },
    modal: {
      ondismiss: () => {
        opts.onDismiss?.();
      },
    },
  });

  rzp.open();
}
