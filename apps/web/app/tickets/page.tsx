import type { Prisma } from "@prisma/client";
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, PaginationControls, Select, SortableTh, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_PRIORITIES, TICKET_STATUSES } from "@agentdesk/shared";
import { canMutateTickets } from "@agentdesk/domain";
import { slaTone, formatDateTime, priorityTone, ticketStatusTone } from "../../lib/format";
import { bulkUpdateTicketsAction } from "../../lib/actions";
import { requireCurrentUser } from "../../lib/auth";
import {
  DEFAULT_TICKET_SORT,
  TICKET_SORT_KEYS,
  pageHref,
  parsePagination,
  parseSort,
  sortHref,
  sortIndicator,
  totalPages,
  type TicketSortKey
} from "../../lib/pagination";

export const dynamic = "force-dynamic";

type TicketsSearchParams = {
  status?: string;
  priority?: string;
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  direction?: string;
  applied?: string;
  skipped?: string;
  skippedReason?: string;
};

export default async function TicketsPage({ searchParams }: { searchParams: TicketsSearchParams }) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const sort = parseSort<TicketSortKey>(searchParams.sort, searchParams.direction, TICKET_SORT_KEYS, DEFAULT_TICKET_SORT);

  const where: Prisma.TicketWhereInput = {
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
  };

  // `sort.key` came from parseSort, so it is one of TICKET_SORT_KEYS and
  // never arbitrary user input. Prisma cannot infer that from a computed
  // key, hence the assertion.
  //
  // Sorting by an enum column (priority, status) orders by the order the
  // values are declared in schema.prisma, not alphabetically. For priority
  // that is LOW → CRITICAL, so "desc" puts CRITICAL first, which is what a
  // triage queue wants.
  const orderBy = { [sort.key]: sort.direction } as Prisma.TicketOrderByWithRelationInput;

  const [tickets, totalTickets, assignableUsers] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: { assignedUser: true, assignedTeam: true, incident: true },
      orderBy,
      skip: pagination.skip,
      take: pagination.take
    }),
    prisma.ticket.count({ where }),
    prisma.user.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } })
  ]);

  const pages = totalPages(totalTickets, pagination.pageSize);
  const writable = canMutateTickets(currentUser.role);
  const columnHref = (key: TicketSortKey) => sortHref("/tickets", searchParams, sort, key);

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
          {/* Carry the sort through the filter form. Without these, applying a
              filter would silently reset the ordering the user chose. */}
          <input type="hidden" name="sort" value={sort.key} />
          <input type="hidden" name="direction" value={sort.direction} />
          <Button type="submit">Apply</Button>
        </form>

        {searchParams.applied ? (
          <p className={searchParams.skipped ? "text-danger" : "muted"}>
            {searchParams.applied} ticket(s) updated
            {searchParams.skipped ? `, ${searchParams.skipped} skipped — ${searchParams.skippedReason ?? "not eligible"}` : ""}.
          </p>
        ) : null}

        {tickets.length === 0 ? (
          <EmptyState title="No tickets match these filters">
            Try clearing the search box, or widening the status and priority filters.
          </EmptyState>
        ) : (
          <form action={bulkUpdateTicketsAction}>
            {writable ? (
              <div className="filter-bar" style={{ marginBottom: 12 }}>
                <Field label="Set Status">
                  <Select name="status" defaultValue="">
                    <option value="">Leave unchanged</option>
                    {TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {labelMaps.ticketStatus[status]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Set Priority">
                  <Select name="priority" defaultValue="">
                    <option value="">Leave unchanged</option>
                    {TICKET_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {labelMaps.priority[priority]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assign To">
                  <Select name="assignedUserId" defaultValue="">
                    <option value="">Leave unchanged</option>
                    {assignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" variant="primary">Apply to Selected</Button>
              </div>
            ) : null}

          <DataTable>
            <thead>
              <tr>
                {writable ? <th scope="col" aria-label="Select" /> : null}
                <th scope="col">Ticket</th>
                <SortableTh href={columnHref("status")} label="Status" indicator={sortIndicator(sort, "status")} />
                <SortableTh href={columnHref("priority")} label="Priority" indicator={sortIndicator(sort, "priority")} />
                <SortableTh href={columnHref("slaDueAt")} label="SLA" indicator={sortIndicator(sort, "slaDueAt")} />
                <th scope="col">Owner</th>
                <th scope="col">Incident</th>
                <SortableTh href={columnHref("updatedAt")} label="Updated" indicator={sortIndicator(sort, "updatedAt")} />
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const sla = slaTone({
                  status: ticket.status,
                  slaDueAt: ticket.slaDueAt,
                  resolvedAt: ticket.resolvedAt,
                  slaPausedAt: ticket.slaPausedAt,
                  slaPausedTotalMs: ticket.slaPausedTotalMs
                });
                return (
                  <tr key={ticket.id}>
                    {writable ? (
                      <td>
                        <input type="checkbox" name="ticketIds" value={ticket.id} aria-label={`Select ${ticket.title}`} />
                      </td>
                    ) : null}
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
                      {sla.paused ? <Badge tone="info">Paused</Badge> : null}
                      <div className="muted">{formatDateTime(sla.effectiveDueAt)}</div>
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
          </form>
        )}

        <PaginationControls
          page={pagination.page}
          totalPages={pages}
          totalItems={totalTickets}
          previousHref={pageHref("/tickets", searchParams, pagination.page - 1)}
          nextHref={pageHref("/tickets", searchParams, pagination.page + 1)}
          itemLabel="tickets"
        />
      </Card>
    </>
  );
}
