"use client";

/**
 * Catches errors thrown by the root layout itself (fonts, providers) —
 * the one place `error.tsx` can't reach. Must render its own <html>/<body>.
 * Never render raw `error.message` to users.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Something went wrong loading FORGE Business OS.</p>
          <p style={{ color: "#6b6459", fontSize: "0.875rem" }}>
            Please try again. If the problem continues, contact support.
          </p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
