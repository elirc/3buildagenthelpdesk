import { notFound } from "next/navigation";
import { diffAgentOutputs } from "@agentdesk/agents";
import type { AgentRunResult } from "@agentdesk/agents";
import { Badge, Button, Card, DataTable, DescriptionList, JsonBlock, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { formatDateTime } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";
import { replayAgentRunAction } from "../../../lib/actions";

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

  // Replays of this run, newest first, so a version comparison is available
  // without leaving the page.
  const replays = await prisma.agentRun.findMany({
    where: { organizationId: currentUser.organizationId, replayOfRunId: run.id },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  const summary = getRunSummary(run.output);

  // Only a successful pair can be compared: a failed replay has no output,
  // and its error message is the finding.
  const latestReplay = replays[0];
  const diff =
    latestReplay && latestReplay.status === "SUCCEEDED" && run.output && latestReplay.output
      ? diffAgentOutputs(run.output as unknown as AgentRunResult, latestReplay.output as unknown as AgentRunResult)
      : null;

  return (
    <>
      <PageHeader
        title={labelMaps.agentType[run.agentType]}
        eyebrow={run.id}
        actions={
          run.isReplay ? null : (
            <form action={replayAgentRunAction}>
              <input type="hidden" name="agentRunId" value={run.id} />
              <Button type="submit" variant="primary">Replay with Current Version</Button>
            </form>
          )
        }
      >
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

          {run.isReplay ? (
            <Card title="This is a replay">
              <p className="muted">
                Produced by re-running the stored input snapshot of{" "}
                <a href={`/agents/${run.replayOfRunId}`}>the original run</a> against agent version {run.agentVersion}.
              </p>
            </Card>
          ) : null}

          {diff ? (
            <Card title="Version Comparison">
              <DescriptionList
                items={[
                  { label: "Original Version", value: `v${run.agentVersion}` },
                  { label: "Replay Version", value: `v${latestReplay.agentVersion}` },
                  {
                    label: "Verdict",
                    value: (
                      <Badge
                        tone={diff.verdict === "material" ? "danger" : diff.verdict === "cosmetic" ? "warning" : "success"}
                      >
                        {diff.verdict}
                      </Badge>
                    )
                  },
                  {
                    label: "Confidence Delta",
                    value: diff.confidenceDelta === 0 ? "No change" : `${diff.confidenceDelta > 0 ? "+" : ""}${Math.round(diff.confidenceDelta)}`
                  },
                  { label: "Trace Steps", value: `${diff.traceStepsBefore} → ${diff.traceStepsAfter}` },
                  { label: "Replayed", value: formatDateTime(latestReplay.createdAt) }
                ]}
              />

              {diff.changedFields.length > 0 ? (
                <DataTable>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.changedFields.slice(0, 12).map((change) => (
                      <tr key={change.path}>
                        <td>{change.path}</td>
                        <td className="muted">{JSON.stringify(change.before)}</td>
                        <td>{JSON.stringify(change.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : (
                <p className="muted">No output fields changed.</p>
              )}

              {diff.addedFindings.map((finding) => (
                <p key={finding} className="text-danger">+ {finding}</p>
              ))}
              {diff.removedFindings.map((finding) => (
                <p key={finding} className="muted">− {finding}</p>
              ))}
            </Card>
          ) : null}

          {latestReplay && latestReplay.status === "FAILED" ? (
            <Card title="Replay Failed">
              <p className="text-danger">{latestReplay.errorMessage}</p>
              <p className="muted">
                The stored input no longer satisfies the current agent. That is itself the result: the change was
                breaking for inputs of this shape.
              </p>
            </Card>
          ) : null}

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
