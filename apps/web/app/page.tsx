import type { Prisma } from "@prisma/client";
import { Badge, Card, DataTable, Metric, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_PRIORITIES } from "@agentdesk/shared";
import { SLA_WARNING_WINDOW_HOURS } from "@agentdesk/domain";
import { formatDateTime, logLevelTone, priorityTone } from "../lib/format";
import { requireCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

/** Tickets are "on the SLA watchlist" once they are inside the warning
 *  window used by getSlaState, which includes everything already breached.
 *  The window itself is owned by the domain so the two cannot drift. */
const SLA_WARNING_WINDOW_MS = SLA_WARNING_WINDOW_HOURS * 60 * 60 * 1000;

export default async function DashboardPage() {
  const currentUser = await requireCurrentUser();

  // Every metric on this page is a number, so every metric is a count query.
  //
  // This used to load every open ticket into memory and then call .length,
  // .reduce and .filter on the array. That works on seed data and quietly
  // becomes the slowest page in the app once an organization has a real
  // backlog: it transfers thousands of rows, plus two joins each, to
  // produce four integers.
  const openTicketWhere: Prisma.TicketWhereInput = {
    organizationId: currentUser.organizationId,
    status: { notIn: ["RESOLVED", "CLOSED"] }
  };
  const slaWatchCutoff = new Date(Date.now() + SLA_WARNING_WINDOW_MS);

  const [
    openTicketCount,
    openTicketsByPriority,
    slaWatchRows,
    awaitingFirstResponse,
    activeIncidents,
    failedJobs,
    prodErrorLogs,
    latestAgentRuns,
    recentAuditEvents,
    latestLogs
  ] = await Promise.all([
    prisma.ticket.count({ where: openTicketWhere }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: openTicketWhere,
      _count: true
    }),
    // "Approaching" and "breached" together are just "due within the warning
    // window", so the database can answer this without scoring each row.
    //
    // Raw SQL because the effective deadline is slaDueAt plus two other
    // columns, and Prisma's query builder cannot compare a column against
    // an expression built from other columns. The alternatives were to load
    // every open ticket and score it in JS — the exact problem the rest of
    // this page just stopped doing — or to ignore paused time and report a
    // number that contradicts the ticket pages. Neither is better than one
    // readable query.
    //
    // The interpolations are parameterised by Prisma's tagged template, not
    // string-concatenated, so this is not an injection surface.
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "Ticket"
      WHERE "organizationId" = ${currentUser.organizationId}
        AND "status" NOT IN ('RESOLVED', 'CLOSED')
        AND "slaDueAt"
              + make_interval(secs => "slaPausedTotalMs" / 1000.0)
              + COALESCE(now() - "slaPausedAt", interval '0')
            <= ${slaWatchCutoff}
    `,
    prisma.ticket.count({
      where: {
        ...openTicketWhere,
        firstRespondedAt: null,
        firstResponseDueAt: { lt: new Date() }
      }
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

  // groupBy only returns rows for priorities that actually occur, so a
  // priority with no open tickets is absent rather than zero. Fold the
  // result into a lookup that answers for all four.
  // COUNT always returns exactly one row, but the type is an array.
  const slaWatchCount = slaWatchRows[0]?.count ?? 0;

  const openByPriority = Object.fromEntries(
    openTicketsByPriority.map((row) => [row.priority, row._count])
  ) as Partial<Record<(typeof TICKET_PRIORITIES)[number], number>>;

  return (
    <>
      <PageHeader title="Operations Dashboard" eyebrow="Today">
        <p>Support, incident, job, log, and deterministic agent signals in one operational view.</p>
      </PageHeader>

      <div className="grid grid--5">
        <Metric label="Open Tickets" value={openTicketCount} tone="info" />
        <Metric label="SLA Watch" value={slaWatchCount} tone={slaWatchCount > 0 ? "warning" : "success"} />
        <Metric label="Active Incidents" value={activeIncidents.length} tone={activeIncidents.length > 0 ? "danger" : "success"} />
        <Metric
          label="No First Response"
          value={awaitingFirstResponse}
          tone={awaitingFirstResponse > 0 ? "danger" : "success"}
        />
        <Metric label="Failed Jobs" value={failedJobs} tone={failedJobs > 0 ? "danger" : "success"} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <Card title="Open Tickets by Priority">
          <div className="grid grid--4">
            {TICKET_PRIORITIES.map((priority) => (
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
