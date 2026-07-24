import { Badge, Button, Card, DataTable, Field, PageHeader, Select, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_PRIORITIES, TICKET_STATUSES } from "@agentdesk/shared";
import { slaTone, formatDateTime, priorityTone, ticketStatusTone } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams
}: {
  searchParams: { status?: string; priority?: string; q?: string };
}) {
  const currentUser = await requireCurrentUser();
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: currentUser.organizationId,
      status: searchParams.status ? (searchParams.status as never) : undefined,
      priority: searchParams.priority ? (searchParams.priority as never) : undefined,
      OR: searchParams.q
        ? [
            { title: { contains: searchParams.q, mode: "insensitive" } },
            { customerName: { contains: searchParams.q, mode: "insensitive" } },
            { requesterEmail: { contains: searchParams.q, mode: "insensitive" } }
          ]
        : undefined
    },
    include: {
      assignedUser: true,
      assignedTeam: true,
      incident: true
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
  });

  return (
    <>
      <PageHeader
        title="Tickets"
        eyebrow="Help desk"
        actions={<Button href="/tickets/new" variant="primary">New Ticket</Button>}
      >
        <p>Customer issues with controlled status transitions, SLA visibility, linked incidents, and agent summaries.</p>
      </PageHeader>

      <Card>
        <form className="filter-bar">
          <Field label="Search">
            <TextInput name="q" defaultValue={searchParams.q} placeholder="Customer, title, requester" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={searchParams.status ?? ""}>
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelMaps.ticketStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue={searchParams.priority ?? ""}>
              <option value="">All priorities</option>
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {labelMaps.priority[priority]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Apply</Button>
        </form>

        <DataTable>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Status</th>
              <th>Priority</th>
              <th>SLA</th>
              <th>Owner</th>
              <th>Incident</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const sla = slaTone({ status: ticket.status, slaDueAt: ticket.slaDueAt, resolvedAt: ticket.resolvedAt });
              return (
                <tr key={ticket.id}>
                  <td>
                    <a href={`/tickets/${ticket.id}`}>{ticket.title}</a>
                    <div className="muted">{ticket.customerName}</div>
                  </td>
                  <td>
                    <Badge tone={ticketStatusTone(ticket.status)}>{labelMaps.ticketStatus[ticket.status]}</Badge>
                  </td>
                  <td>
                    <Badge tone={priorityTone(ticket.priority)}>{labelMaps.priority[ticket.priority]}</Badge>
                  </td>
                  <td>
                    <Badge tone={sla.tone}>{sla.label}</Badge>
                    <div className="muted">{formatDateTime(ticket.slaDueAt)}</div>
                  </td>
                  <td>
                    {ticket.assignedUser?.name ?? "Unassigned"}
                    <div className="muted">{ticket.assignedTeam?.name ?? "No team"}</div>
                  </td>
                  <td>{ticket.incident ? <a href={`/incidents/${ticket.incident.id}`}>{ticket.incident.title}</a> : <span className="muted">None</span>}</td>
                  <td>{formatDateTime(ticket.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
