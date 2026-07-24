"use client";

import { Button, Card, PageHeader } from "@agentdesk/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeader title="Something went wrong" eyebrow="Recoverable error">
        <p>{error.message || "The app could not complete the last request."}</p>
      </PageHeader>
      <Card>
        <div className="actions">
          <Button type="button" onClick={reset}>
            Try Again
          </Button>
          <Button href="/">Back to Dashboard</Button>
        </div>
      </Card>
    </>
  );
}
