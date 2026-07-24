import type { Prisma } from "@prisma/client";
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, PaginationControls, Select, SortableTh } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, labelMaps } from "@agentdesk/shared";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";
import {
  DEFAULT_INCIDENT_SORT,
  INCIDENT_SORT_KEYS,
  pageHref,
  parsePagination,
  parseSort,
  sortHref,
  sortIndicator,
  totalPages,
  type IncidentSortKey
} from "../../lib/pagination";

export const dynamic = "force-dynamic";

type IncidentsSearchParams = {
  status?: string;
  severity?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  direction?: string;
};

export default async function IncidentsPage({ searchParams }: { searchParams: IncidentsSearchParams }) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const sort = parseSort<IncidentSortKey>(searchParams.sort, searchParams.direction, INCIDENT_SORT_KEYS, DEFAULT_INCIDENT_SORT);

  const where: Prisma.IncidentWhereInput = {
    organizationId: currentUser.organizationId,
    status: searchParams.status ? (searchParams.status as never) : undefined,
    severity: searchParams.severity ? (searchParams.severity as never) : undefined
  };

  // Severity is declared SEV1 → SEV4, so "asc" surfaces the most severe
  // first. That reads backwards until you remember Prisma sorts enums by
  // declaration order rather than by label.
  const orderBy = { [sort.key]: sort.direction } as Prisma.IncidentOrderByWithRelationInput;

  const [incidents, totalIncidents] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: { owner: true, _count: { select: { tickets: true, logs: true, jobs: true } } },
      orderBy,
      skip: pagination.skip,
      take: pagination.take
    }),
    prisma.incident.count({ where })
  ]);

  const pages = totalPages(totalIncidents, pagination.pageSize);
  const columnHref = (key: IncidentSortKey) => sortHref("/incidents", searchParams, sort, key);

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
        <form className="filter-bar">
          <Field label="Status">
            <Select name="status" defaultValue={searchParams.status ?? ""}>
              <option value="">All statuses</option>
              {INCIDENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelMaps.incidentStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severity">
            <Select name="severity" defaultValue={searchParams.severity ?? ""}>
              <option value="">All severities</option>
              {INCIDENT_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </Select>
          </Field>
          <input type="hidden" name="sort" value={sort.key} />
          <input type="hidden" name="direction" value={sort.direction} />
          <Button type="submit">Apply</Button>
        </form>

        {incidents.length === 0 ? (
          <EmptyState title="No incidents match these filters">
            Clear the status and severity filters to see the full incident history.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Incident</th>
                <SortableTh href={columnHref("status")} label="Status" indicator={sortIndicator(sort, "status")} />
                <SortableTh href={columnHref("severity")} label="Severity" indicator={sortIndicator(sort, "severity")} />
                <SortableTh href={columnHref("affectedService")} label="Service" indicator={sortIndicator(sort, "affectedService")} />
                <th scope="col">Owner</th>
                <th scope="col">Evidence</th>
                <SortableTh href={columnHref("startedAt")} label="Started" indicator={sortIndicator(sort, "startedAt")} />
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
        )}

        <PaginationControls
          page={pagination.page}
          totalPages={pages}
          totalItems={totalIncidents}
          previousHref={pageHref("/incidents", searchParams, pagination.page - 1)}
          nextHref={pageHref("/incidents", searchParams, pagination.page + 1)}
          itemLabel="incidents"
        />
      </Card>
    </>
  );
}
