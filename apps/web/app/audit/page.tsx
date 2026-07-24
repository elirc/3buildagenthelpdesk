import { Button, Card, DataTable, Field, JsonBlock, PageHeader, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";
import { pageHref, parsePagination } from "../../lib/pagination";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams
}: {
  searchParams: { action?: string; entityType?: string; actorUserId?: string; from?: string; to?: string; page?: string; pageSize?: string };
}) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const from = searchParams.from ? new Date(searchParams.from) : undefined;
  const to = searchParams.to ? new Date(searchParams.to) : undefined;
  const where = {
    organizationId: currentUser.organizationId,
    action: searchParams.action || undefined,
    entityType: searchParams.entityType || undefined,
    actorUserId: searchParams.actorUserId || undefined,
    createdAt: from || to ? { gte: Number.isNaN(from?.getTime()) ? undefined : from, lte: Number.isNaN(to?.getTime()) ? undefined : to } : undefined
  };
  const [events, totalEvents] = await Promise.all([
    prisma.auditEvent.findMany({
    where,
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take
  }),
    prisma.auditEvent.count({ where })
  ]);

  return (
    <>
      <PageHeader title="Audit Events" eyebrow="Governance">
        <p>Append-only history for major user and system actions across tickets, incidents, jobs, and agents.</p>
      </PageHeader>
      <Card>
        <form className="filter-bar">
          <Field label="Action">
            <TextInput name="action" defaultValue={searchParams.action} placeholder="ticket.updated" />
          </Field>
          <Field label="Entity Type">
            <TextInput name="entityType" defaultValue={searchParams.entityType} placeholder="Ticket" />
          </Field>
          <Field label="Actor ID">
            <TextInput name="actorUserId" defaultValue={searchParams.actorUserId} />
          </Field>
          <Field label="From">
            <TextInput name="from" type="datetime-local" defaultValue={searchParams.from} />
          </Field>
          <Field label="To">
            <TextInput name="to" type="datetime-local" defaultValue={searchParams.to} />
          </Field>
          <Button type="submit">Apply</Button>
        </form>
        <DataTable>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td>{event.actor?.name ?? "System"}</td>
                <td>{event.action}</td>
                <td>{event.entityType}<div className="muted">{event.entityId}</div></td>
                <td>{event.before ? <JsonBlock value={event.before} /> : <span className="muted">None</span>}</td>
                <td>{event.after ? <JsonBlock value={event.after} /> : <span className="muted">None</span>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="actions" style={{ marginTop: 12 }}>
          <span className="muted">Page {pagination.page} of {Math.max(1, Math.ceil(totalEvents / pagination.pageSize))}</span>
          <Button href={pageHref("/audit", searchParams, pagination.page - 1)} disabled={pagination.page <= 1}>Previous</Button>
          <Button href={pageHref("/audit", searchParams, pagination.page + 1)} disabled={pagination.page * pagination.pageSize >= totalEvents}>Next</Button>
        </div>
      </Card>
    </>
  );
}
