import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { Badge, Button, Card, DataTable, DescriptionList, JsonBlock, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { canRetryJob } from "@agentdesk/domain";
import { deadLetterJobAction, retryJobAction, runJobAgentAction } from "../../../lib/actions";
import { formatDateTime, logLevelTone } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function jobStatusTone(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "DEAD_LETTERED") return "danger" as const;
  if (status === "RETRYING" || status === "RUNNING") return "warning" as const;
  return "neutral" as const;
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await requireCurrentUser();
  const job = await prisma.backgroundJob.findFirst({
    where: { id: params.id, organizationId: currentUser.organizationId },
    include: {
      relatedTicket: true,
      relatedIncident: true
    }
  });
  if (!job) notFound();

  const logWhere: Prisma.StructuredLogWhereInput[] = [
    ...(job.relatedTicketId ? [{ ticketId: job.relatedTicketId }] : []),
    ...(job.relatedIncidentId ? [{ incidentId: job.relatedIncidentId }] : [])
  ];

  const [logs, agentRuns, auditEvents] = await Promise.all([
    prisma.structuredLog.findMany({
      where: logWhere.length > 0 ? { organizationId: currentUser.organizationId, OR: logWhere } : { id: "__no-related-logs__", organizationId: currentUser.organizationId },
      orderBy: { timestamp: "desc" },
      take: 12
    }),
    prisma.agentRun.findMany({
      where: { organizationId: currentUser.organizationId, targetType: "JOB", targetId: job.id },
      include: { createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.auditEvent.findMany({
      where: { organizationId: currentUser.organizationId, entityType: "BackgroundJob", entityId: job.id },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  return (
    <>
      <PageHeader
        title={labelMaps.jobType[job.type]}
        eyebrow={job.id}
        actions={
          <div className="actions">
            <form action={runJobAgentAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="primary">Run Job Agent</Button>
            </form>
            <form action={retryJobAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" disabled={!canRetryJob(job.status, job.attempts, job.maxAttempts)}>Retry</Button>
            </form>
            <form action={deadLetterJobAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="danger" disabled={job.status === "DEAD_LETTERED" || job.status === "SUCCEEDED"}>Dead Letter</Button>
            </form>
          </div>
        }
      >
        <Badge tone={jobStatusTone(job.status)}>{labelMaps.jobStatus[job.status]}</Badge>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Job Details">
            <DescriptionList
              items={[
                { label: "Type", value: labelMaps.jobType[job.type] },
                { label: "Status", value: labelMaps.jobStatus[job.status] },
                { label: "Attempts", value: `${job.attempts}/${job.maxAttempts}` },
                {
                  label: "Next Attempt",
                  value:
                    job.status === "DEAD_LETTERED" || job.status === "SUCCEEDED"
                      ? "None"
                      : job.runAt > new Date()
                        ? `${formatDateTime(job.runAt)} (backing off)`
                        : "Due now"
                },
                { label: "Last Attempt", value: formatDateTime(job.lastAttemptAt) },
                { label: "Created", value: formatDateTime(job.createdAt) },
                { label: "Started", value: formatDateTime(job.startedAt) },
                { label: "Finished", value: formatDateTime(job.finishedAt) },
                { label: "Ticket", value: job.relatedTicket ? <a href={`/tickets/${job.relatedTicket.id}`}>{job.relatedTicket.title}</a> : "None" },
                { label: "Incident", value: job.relatedIncident ? <a href={`/incidents/${job.relatedIncident.id}`}>{job.relatedIncident.title}</a> : "None" }
              ]}
            />
            {job.errorMessage ? <p className="text-danger">{job.errorMessage}</p> : null}
          </Card>

          <Card title="Payload">
            <JsonBlock value={job.payload} />
          </Card>

          <Card title="Related Logs">
            <DataTable>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.timestamp)}</td>
                    <td><Badge tone={logLevelTone(log.level)}>{log.level}</Badge></td>
                    <td><a href={`/logs/${log.id}`}>{log.message}</a></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="grid">
          <Card title="Investigation Runs">
            <DataTable>
              <tbody>
                {agentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <a href={`/agents/${run.id}`}>{labelMaps.agentType[run.agentType]}</a>
                      <div className="muted">{formatDateTime(run.createdAt)}</div>
                    </td>
                    <td>{run.confidenceScore == null ? "Pending" : `${Math.round(run.confidenceScore)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="Audit Events">
            <div className="timeline">
              {auditEvents.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <time>{formatDateTime(event.createdAt)}</time>
                  <strong>{event.action}</strong>
                  <p className="muted">{event.actor?.name ?? "System"}</p>
                </div>
              ))}
            </div>
          </Card>

          {agentRuns[0]?.output ? (
            <Card title="Latest Agent Output">
              <JsonBlock value={agentRuns[0].output} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
