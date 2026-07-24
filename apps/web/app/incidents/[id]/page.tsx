import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, DescriptionList, Field, JsonBlock, PageHeader, Select } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { INCIDENT_STATUSES, labelMaps } from "@agentdesk/shared";
import { runLogAnomalyAction, updateIncidentStatusAction } from "../../../lib/actions";
import { formatDateTime, logLevelTone, priorityTone, ticketStatusTone } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await requireCurrentUser();
  const [incident, agentRuns, auditEvents] = await Promise.all([
    prisma.incident.findFirst({
      where: { id: params.id, organizationId: currentUser.organizationId },
      include: {
        owner: true,
        tickets: { include: { assignedUser: true }, orderBy: { updatedAt: "desc" } },
        logs: { orderBy: { timestamp: "desc" }, take: 20 },
        jobs: { orderBy: { createdAt: "desc" }, take: 12 }
      }
    }),
    prisma.agentRun.findMany({
      where: { organizationId: currentUser.organizationId, targetType: "INCIDENT", targetId: params.id },
      include: { createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.auditEvent.findMany({
      where: { organizationId: currentUser.organizationId, entityType: "Incident", entityId: params.id },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  if (!incident) notFound();

  return (
    <>
      <PageHeader
        title={incident.title}
        eyebrow={incident.affectedService}
        actions={
          <form action={runLogAnomalyAction}>
            <input type="hidden" name="incidentId" value={incident.id} />
            <Button type="submit" variant="primary">Run Anomaly Agent</Button>
          </form>
        }
      >
        <div className="pill-list">
          <Badge tone={incident.status === "RESOLVED" ? "success" : "info"}>{labelMaps.incidentStatus[incident.status]}</Badge>
          <Badge tone={incident.severity === "SEV1" || incident.severity === "SEV2" ? "danger" : "warning"}>{incident.severity}</Badge>
        </div>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Incident Details">
            <DescriptionList
              items={[
                { label: "Owner", value: incident.owner?.name ?? "Unowned" },
                { label: "Started", value: formatDateTime(incident.startedAt) },
                { label: "Resolved", value: formatDateTime(incident.resolvedAt) },
                { label: "Affected Service", value: incident.affectedService }
              ]}
            />
            <p>{incident.description}</p>
            {incident.agentFindings ? <JsonBlock value={incident.agentFindings} /> : null}
          </Card>

          <Card title="Update Status">
            <form action={updateIncidentStatusAction} className="actions">
              <input type="hidden" name="incidentId" value={incident.id} />
              <Field label="Status">
                <Select name="status" defaultValue={incident.status}>
                  {INCIDENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labelMaps.incidentStatus[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary">Save</Button>
            </form>
          </Card>

          <Card title="Linked Tickets">
            <DataTable>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {incident.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><a href={`/tickets/${ticket.id}`}>{ticket.title}</a></td>
                    <td><Badge tone={ticketStatusTone(ticket.status)}>{labelMaps.ticketStatus[ticket.status]}</Badge></td>
                    <td><Badge tone={priorityTone(ticket.priority)}>{labelMaps.priority[ticket.priority]}</Badge></td>
                    <td>{ticket.assignedUser?.name ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="Related Logs">
            <DataTable>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {incident.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.timestamp)}</td>
                    <td><Badge tone={logLevelTone(log.level)}>{log.level}</Badge></td>
                    <td><a href={`/logs/${log.id}`}>{log.message}</a></td>
                    <td className="muted">{log.fingerprint}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="grid">
          <Card title="Related Jobs">
            <DataTable>
              <tbody>
                {incident.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <a href={`/jobs/${job.id}`}>{labelMaps.jobType[job.type]}</a>
                      <div className="muted">{labelMaps.jobStatus[job.status]} - {job.attempts}/{job.maxAttempts}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="Agent Runs">
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

          <Card title="Audit History">
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
        </div>
      </div>
    </>
  );
}
