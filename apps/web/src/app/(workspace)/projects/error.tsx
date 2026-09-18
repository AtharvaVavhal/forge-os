"use client";

import { Alert } from "@/components/feedback/alert";
import { Button } from "@/components/ui/button";

export default function ProjectsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Alert tone="danger" title="This projects view couldn’t load">
        Try again. If the problem continues, contact support.
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
