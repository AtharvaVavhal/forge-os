import { cn } from "@/lib/cn";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  summary,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  summary?: string;
}) {
  const atStart = page <= 1;
  const atEnd = page >= pageCount || pageCount === 0;

  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-steel/15 px-3 py-2"
      aria-label="Pagination"
    >
      <p className="type-metadata text-steel">{summary ?? `Page ${page} of ${Math.max(pageCount, 1)}`}</p>
      <div className="flex items-center gap-1">
        <IconButton
          label="Previous page"
          disabled={atStart}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft size={16} />
        </IconButton>
        <IconButton
          label="Next page"
          disabled={atEnd}
          onClick={() => onPageChange(page + 1)}
          className={cn(atEnd && "opacity-60")}
        >
          <IconChevronRight size={16} />
        </IconButton>
      </div>
    </nav>
  );
}
