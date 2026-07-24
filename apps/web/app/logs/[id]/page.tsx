import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, DescriptionList, JsonBlock, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { runLogAnomalyAction } from "../../../lib/actions";
import { formatDateTime, logLevelTone } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function LogDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await requireCurrentUser();
  const log = await prisma.structuredLog.findFirst({
    where: { id: params.id, organizationId: currentUser.organizationId },
    include: { ticket: true, incident: true }
  });
  if (!log) notFound();

  const related = await prisma.structuredLog.findMany({
    where: { organizationId: currentUser.organizationId, fingerprint: log.fingerprint },
    orderBy: { timestamp: "desc" },
    take: 20
  });

  return (
    <>
      <PageHeader
        title="Log Detail"
        eyebrow={log.service}
        actions={
          <form action={runLogAnomalyAction}>
            <input type="hidden" name="fingerprint" value={log.fingerprint} />
            <input type="hidden" name="service" value={log.service} />
            <input type="hidden" name="environment" value={log.environment} />
            <Button type="submit" variant="primary">Run Anomaly Agent</Button>
          </form>
        }
      >
        <Badge tone={logLevelTone(log.level)}>{log.level}</Badge>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Structured Event">
            <DescriptionList
              items={[
                { label: "Timestamp", value: formatDateTime(log.timestamp) },
                { label: "Environment", value: log.environment },
                { label: "Request ID", value: log.requestId },
                { label: "Fingerprint", value: log.fingerprint },
                { label: "Ticket", value: log.ticket ? <a href={`/tickets/${log.ticket.id}`}>{log.ticket.title}</a> : "None" },
                { label: "Incident", value: log.incident ? <a href={`/incidents/${log.incident.id}`}>{log.incident.title}</a> : "None" }
              ]}
            />
            <p>{log.message}</p>
          </Card>
          <Card title="Metadata">
            <JsonBlock value={log.metadata} />
          </Card>
        </div>
        <Card title="Same Fingerprint">
          <DataTable>
            <tbody>
              {related.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/logs/${item.id}`}>{item.message}</a>
                    <div className="muted">{formatDateTime(item.timestamp)} - {item.service}</div>
                  </td>
                  <td><Badge tone={logLevelTone(item.level)}>{item.level}</Badge></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </>
  );
}
