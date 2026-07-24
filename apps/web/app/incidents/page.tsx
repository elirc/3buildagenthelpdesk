import { Badge, Button, Card, DataTable, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const currentUser = await requireCurrentUser();
  const incidents = await prisma.incident.findMany({
    where: { organizationId: currentUser.organizationId },
    include: {
      owner: true,
      _count: { select: { tickets: true, logs: true, jobs: true } }
    },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { startedAt: "desc" }]
  });

  return (
    <>
      <PageHeader
        title="Incidents"
        eyebrow="Operations"
        actions={<Button href="/incidents/new" variant="primary">New Incident</Button>}
      >
        <p>Service-impacting events with linked tickets, logs, failed jobs, owners, and agent investigation results.</p>
      </PageHeader>
      <Card>
        <DataTable>
          <thead>
            <tr>
              <th>Incident</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Service</th>
              <th>Owner</th>
              <th>Evidence</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id}>
                <td>
                  <a href={`/incidents/${incident.id}`}>{incident.title}</a>
                  <div className="muted">{incident.description.slice(0, 120)}</div>
                </td>
                <td><Badge tone={incident.status === "RESOLVED" ? "success" : "info"}>{labelMaps.incidentStatus[incident.status]}</Badge></td>
                <td><Badge tone={incident.severity === "SEV1" || incident.severity === "SEV2" ? "danger" : "warning"}>{incident.severity}</Badge></td>
                <td>{incident.affectedService}</td>
                <td>{incident.owner?.name ?? "Unowned"}</td>
                <td className="muted">{incident._count.tickets} tickets, {incident._count.logs} logs, {incident._count.jobs} jobs</td>
                <td>{formatDateTime(incident.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
