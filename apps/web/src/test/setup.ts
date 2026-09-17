import "@testing-library/jest-dom/vitest";
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

export const navigationState = {
  pathname: "/",
};

export const routerMocks = {
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children),
}));

afterEach(() => {
  cleanup();
  navigationState.pathname = "/";
  routerMocks.replace.mockReset();
  routerMocks.push.mockReset();
  routerMocks.refresh.mockReset();
  sessionStorage.clear();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
