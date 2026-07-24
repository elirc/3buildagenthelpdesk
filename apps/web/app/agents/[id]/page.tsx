import { notFound } from "next/navigation";
import { Badge, Card, DescriptionList, JsonBlock, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { formatDateTime } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function getRunSummary(output: unknown): { summary?: string; findings: string[]; recommendations: string[]; limitations: string[] } {
  if (!output || typeof output !== "object") {
    return { findings: [], recommendations: [], limitations: [] };
  }
  const record = output as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : undefined,
    findings: Array.isArray(record.findings) ? record.findings.filter((item): item is string => typeof item === "string") : [],
    recommendations: Array.isArray(record.recommendations)
      ? record.recommendations.filter((item): item is string => typeof item === "string")
      : [],
    limitations: Array.isArray(record.limitations) ? record.limitations.filter((item): item is string => typeof item === "string") : []
  };
}

export default async function AgentRunDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await requireCurrentUser();
  const run = await prisma.agentRun.findFirst({
    where: { id: params.id, organizationId: currentUser.organizationId },
    include: { createdBy: true }
  });
  if (!run) notFound();

  const summary = getRunSummary(run.output);

  return (
    <>
      <PageHeader title={labelMaps.agentType[run.agentType]} eyebrow={run.id}>
        <div className="pill-list">
          <Badge tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>{run.status}</Badge>
          <Badge tone="info">{run.targetType}</Badge>
        </div>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Run Overview">
            <DescriptionList
              items={[
                { label: "Target", value: `${run.targetType} ${run.targetId}` },
                { label: "Created By", value: run.createdBy?.name ?? "System" },
                { label: "Created", value: formatDateTime(run.createdAt) },
                { label: "Started", value: formatDateTime(run.startedAt) },
                { label: "Completed", value: formatDateTime(run.completedAt) },
                { label: "Confidence", value: run.confidenceScore == null ? "Pending" : `${Math.round(run.confidenceScore)}%` }
              ]}
            />
            {summary.summary ? <p>{summary.summary}</p> : null}
            {run.errorMessage ? <p className="text-danger">{run.errorMessage}</p> : null}
          </Card>

          <Card title="Findings">
            <div className="timeline">
              {summary.findings.map((finding) => (
                <div className="timeline-item" key={finding}>
                  <strong>{finding}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Recommendations">
            <div className="timeline">
              {summary.recommendations.map((recommendation) => (
                <div className="timeline-item" key={recommendation}>
                  <strong>{recommendation}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid">
          <Card title="Limitations">
            {summary.limitations.length > 0 ? (
              summary.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)
            ) : (
              <p className="muted">No limitations recorded.</p>
            )}
          </Card>
          <Card title="Input Snapshot">
            <JsonBlock value={run.inputSnapshot} />
          </Card>
          <Card title="Output">
            <JsonBlock value={run.output} />
          </Card>
          <Card title="Trace">
            <JsonBlock value={run.trace} />
          </Card>
        </div>
      </div>
    </>
  );
}
