"use client";

import { Alert } from "@/components/feedback/alert";
import { Button } from "@/components/ui/button";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Alert tone="danger" title="This projects view couldn’t load">
        {error.message || "Try again."}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
