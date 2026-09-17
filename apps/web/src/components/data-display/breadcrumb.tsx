import Link from "next/link";
import { cn } from "@/lib/cn";

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 overflow-hidden">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <span className="type-metadata shrink-0 text-steel/50" aria-hidden="true">
                  /
                </span>
              ) : null}
              {last || !item.href ? (
                <span
                  className="type-metadata truncate font-medium text-ink"
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="type-metadata truncate text-steel hover:text-ink">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
