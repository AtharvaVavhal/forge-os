import { cn } from "@/lib/cn";
import { IconChevronDown } from "@/components/icons";

export function Table({
  caption,
  children,
  className,
}: {
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-steel/15 bg-paper-elev", className)}>
      <table className="w-full min-w-max border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-sunken">
      <tr>{children}</tr>
    </thead>
  );
}

export function TableHeaderCell({
  children,
  className,
  sorted,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  sorted?: "none" | "ascending" | "descending";
  onSort?: () => void;
}) {
  if (onSort) {
    return (
      <th
        scope="col"
        aria-sort={sorted && sorted !== "none" ? sorted : "none"}
        className={cn("px-[var(--space-table-cell-x)] py-[var(--space-table-cell-y-compact)]", className)}
      >
        <button
          type="button"
          className="type-table-header inline-flex min-h-8 cursor-pointer items-center gap-1 text-steel hover:text-ink"
          onClick={onSort}
        >
          {children}
          <IconChevronDown
            size={16}
            className={cn(
              "text-steel/70",
              sorted === "ascending" && "rotate-180",
              sorted === "none" && "opacity-40"
            )}
          />
        </button>
      </th>
    );
  }

  return (
    <th
      scope="col"
      className={cn(
        "type-table-header px-[var(--space-table-cell-x)] py-[var(--space-table-cell-y-compact)] text-steel",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  className,
  selected = false,
}: {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-t border-steel/10",
        selected ? "bg-ember-soft" : "hover:bg-ink/[0.02]",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className,
  mono = false,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-[var(--space-table-cell-x)] py-[var(--space-table-cell-y-compact)] text-[length:var(--text-body-size)] text-ink",
        mono ? "type-metadata" : "font-display",
        className
      )}
    >
      {children}
    </td>
  );
}

export function TableRowActions({ children }: { children: React.ReactNode }) {
  return (
    <TableCell className="w-10 text-right">
      <div className="flex justify-end">{children}</div>
    </TableCell>
  );
}
