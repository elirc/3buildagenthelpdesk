import { Badge, Card, DataTable, Metric, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { getSlaState } from "@agentdesk/domain";
import { formatDateTime, logLevelTone, priorityTone, ticketStatusTone } from "../lib/format";
import { requireCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentUser = await requireCurrentUser();
  const [
    openTickets,
    activeIncidents,
    failedJobs,
    prodErrorLogs,
    latestAgentRuns,
    recentAuditEvents,
    latestLogs
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: { organizationId: currentUser.organizationId, status: { notIn: ["RESOLVED", "CLOSED"] } },
      include: { assignedUser: true, incident: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
    }),
    prisma.incident.findMany({
      where: { organizationId: currentUser.organizationId, status: { not: "RESOLVED" } },
      include: { owner: true, _count: { select: { tickets: true, logs: true, jobs: true } } },
      orderBy: [{ severity: "asc" }, { startedAt: "desc" }],
      take: 6
    }),
    prisma.backgroundJob.count({ where: { organizationId: currentUser.organizationId, status: { in: ["FAILED", "DEAD_LETTERED"] } } }),
    prisma.structuredLog.count({ where: { organizationId: currentUser.organizationId, environment: "production", level: { in: ["error", "fatal"] } } }),
    prisma.agentRun.findMany({ where: { organizationId: currentUser.organizationId }, include: { createdBy: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.auditEvent.findMany({ where: { organizationId: currentUser.organizationId }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.structuredLog.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { timestamp: "desc" }, take: 8 })
  ]);

  const openByPriority = openTickets.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] ?? 0) + 1;
    return acc;
  }, {});
  const slaBreaching = openTickets.filter((ticket) =>
    ["approaching", "breached"].includes(getSlaState({ status: ticket.status, slaDueAt: ticket.slaDueAt, resolvedAt: ticket.resolvedAt }))
  );

  return (
    <>
      <PageHeader title="Operations Dashboard" eyebrow="Today">
        <p>Support, incident, job, log, and deterministic agent signals in one operational view.</p>
      </PageHeader>

      <div className="grid grid--4">
        <Metric label="Open Tickets" value={openTickets.length} tone="info" />
        <Metric label="SLA Watch" value={slaBreaching.length} tone={slaBreaching.length > 0 ? "warning" : "success"} />
        <Metric label="Active Incidents" value={activeIncidents.length} tone={activeIncidents.length > 0 ? "danger" : "success"} />
        <Metric label="Failed Jobs" value={failedJobs} tone={failedJobs > 0 ? "danger" : "success"} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <Card title="Open Tickets by Priority">
          <div className="grid grid--4">
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((priority) => (
              <Metric key={priority} label={labelMaps.priority[priority]} value={openByPriority[priority] ?? 0} tone={priorityTone(priority)} />
            ))}
          </div>
        </Card>

        <Card title="Production Error Logs">
          <Metric label="Error/Fatal Entries" value={prodErrorLogs} tone={prodErrorLogs > 0 ? "danger" : "success"} />
          <div style={{ marginTop: 12 }}>
            {latestLogs.map((log) => (
              <div className="timeline-item" key={log.id}>
                <time>{formatDateTime(log.timestamp)}</time>
                <Badge tone={logLevelTone(log.level)}>{log.level}</Badge> <span>{log.service}</span>
                <p className="muted">{log.message}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <Card title="Active Incidents">
          <DataTable>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {activeIncidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <a href={`/incidents/${incident.id}`}>{incident.title}</a>
                    <div className="muted">{incident.affectedService}</div>
                  </td>
                  <td>
                    <Badge tone={incident.severity === "SEV1" || incident.severity === "SEV2" ? "danger" : "warning"}>{incident.severity}</Badge>
                  </td>
                  <td>
                    <Badge tone="info">{labelMaps.incidentStatus[incident.status]}</Badge>
                  </td>
                  <td className="muted">
                    {incident._count.tickets} tickets, {incident._count.logs} logs, {incident._count.jobs} jobs
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card title="Latest Agent Findings">
          <DataTable>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {latestAgentRuns.map((run) => (
                <tr key={run.id}>
                  <td>
                    <a href={`/agents/${run.id}`}>{labelMaps.agentType[run.agentType]}</a>
                    <div className="muted">{run.createdBy?.name ?? "System"}</div>
                  </td>
                  <td>
                    <Badge tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>{run.status}</Badge>
                  </td>
                  <td>{run.confidenceScore == null ? "Pending" : `${Math.round(run.confidenceScore)}%`}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>

      <Card title="Recent Audit Events" className="mt" >
        <DataTable>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {recentAuditEvents.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td>{event.actor?.name ?? "System"}</td>
                <td>{event.action}</td>
                <td>
                  {event.entityType} <span className="muted">{event.entityId.slice(0, 8)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
