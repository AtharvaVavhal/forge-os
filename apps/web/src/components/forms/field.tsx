export function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-display text-[length:var(--text-label-size)] font-semibold leading-[var(--text-label-leading)] text-ink"
      >
        {label}
        {required ? (
          <span className="text-ember-deep" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={errorId}
          className="font-display text-[length:var(--text-error-size)] font-medium leading-[var(--text-metadata-leading)] text-ember-deep"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          className="font-display text-[length:var(--text-helper-size)] leading-[var(--text-metadata-leading)] text-steel"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
