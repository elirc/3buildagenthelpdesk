import { Badge, Button, Card, DataTable, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";
import { pageHref, parsePagination } from "../../lib/pagination";

export const dynamic = "force-dynamic";

export default async function AgentRunsPage({ searchParams }: { searchParams: { page?: string; pageSize?: string } }) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const [runs, totalRuns] = await Promise.all([
    prisma.agentRun.findMany({
    where: { organizationId: currentUser.organizationId },
    include: { createdBy: true },
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take
  }),
    prisma.agentRun.count({ where: { organizationId: currentUser.organizationId } })
  ]);

  return (
    <>
      <PageHeader title="Agent Runs" eyebrow="Mock agents">
        <p>Persisted deterministic agent executions with input snapshots, outputs, trace steps, confidence, and audit events.</p>
      </PageHeader>
      <Card>
        <DataTable>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Target</th>
              <th>Confidence</th>
              <th>Created By</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td><a href={`/agents/${run.id}`}>{labelMaps.agentType[run.agentType]}</a></td>
                <td><Badge tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>{run.status}</Badge></td>
                <td>{run.targetType} <span className="muted">{run.targetId.slice(0, 12)}</span></td>
                <td>{run.confidenceScore == null ? "Pending" : `${Math.round(run.confidenceScore)}%`}</td>
                <td>{run.createdBy?.name ?? "System"}</td>
                <td>{formatDateTime(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="actions" style={{ marginTop: 12 }}>
          <span className="muted">Page {pagination.page} of {Math.max(1, Math.ceil(totalRuns / pagination.pageSize))}</span>
          <Button href={pageHref("/agents", searchParams, pagination.page - 1)} disabled={pagination.page <= 1}>Previous</Button>
          <Button href={pageHref("/agents", searchParams, pagination.page + 1)} disabled={pagination.page * pagination.pageSize >= totalRuns}>Next</Button>
        </div>
      </Card>
    </>
  );
}
