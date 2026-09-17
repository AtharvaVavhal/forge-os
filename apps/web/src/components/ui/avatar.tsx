import { cn } from "@/lib/cn";

const sizeClass = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-[length:var(--text-helper-size)]",
  lg: "size-10 text-[length:var(--text-body-small-size)]",
} as const;

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn("rounded-full object-cover", sizeClass[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-info-soft font-display font-semibold text-info-deep",
        sizeClass[size],
        className
      )}
    >
      {initials || "F"}
    </span>
  );
}
