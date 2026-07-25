import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Badge, Button, Card, DataTable, EmptyState, Field, Metric, PageHeader, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import {
  buildBuckets,
  firstResponseHours,
  hasCapability,
  median,
  percentile,
  resolutionHours,
  summarizeSlaAttainment
} from "@agentdesk/domain";
import { formatDate } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

const hours = (value: number) => (value === 0 ? "—" : `${value.toFixed(1)}h`);

export default async function AnalyticsPage({
  searchParams
}: {
  searchParams: { from?: string; to?: string };
}) {
  const currentUser = await requireCurrentUser();

  // Managers and admins only. Individual performance figures are a
  // management tool, and showing an agent their own ranking next to their
  // colleagues' changes what the queue is for.
  if (!hasCapability(currentUser.role, "canned_reply:manage")) {
    notFound();
  }

  const to = parseDate(searchParams.to, new Date());
  const from = parseDate(searchParams.from, new Date(to.getTime() - 30 * DAY_MS));

  const where: Prisma.TicketWhereInput = {
    organizationId: currentUser.organizationId,
    createdAt: { gte: from, lte: to },
    mergedIntoId: null
  };

  const [createdCount, resolvedCount, byTeam, byAssignee, tickets, teams, users] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.count({ where: { ...where, resolvedAt: { not: null } } }),
    // groupBy rather than fetching rows and reducing: the database is much
    // better at counting than JavaScript is.
    prisma.ticket.groupBy({ by: ["assignedTeamId"], where, _count: true }),
    prisma.ticket.groupBy({ by: ["assignedUserId"], where, _count: true }),
    // Percentiles genuinely need the rows. Bounded, and only the four
    // columns the maths uses.
    prisma.ticket.findMany({
      where,
      select: {
        status: true,
        createdAt: true,
        resolvedAt: true,
        slaDueAt: true,
        slaPausedTotalMs: true,
        firstRespondedAt: true,
        assignedTeamId: true,
        assignedUserId: true,
        priority: true
      },
      take: 5000
    }),
    prisma.team.findMany({ where: { organizationId: currentUser.organizationId } }),
    prisma.user.findMany({ where: { organizationId: currentUser.organizationId } })
  ]);

  const sla = summarizeSlaAttainment(tickets);
  const resolution = resolutionHours(tickets);
  const response = firstResponseHours(tickets);
  const buckets = buildBuckets(from, to, "week");

  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name ?? "Unassigned";
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name ?? "Unassigned";

  const perTeam = byTeam.map((row) => {
    const rows = tickets.filter((ticket) => ticket.assignedTeamId === row.assignedTeamId);
    return {
      label: teamName(row.assignedTeamId),
      total: row._count,
      resolved: rows.filter((ticket) => ticket.resolvedAt).length,
      attainment: summarizeSlaAttainment(rows).attainmentPct,
      medianResolution: median(resolutionHours(rows))
    };
  });

  const perAssignee = byAssignee.map((row) => {
    const rows = tickets.filter((ticket) => ticket.assignedUserId === row.assignedUserId);
    return {
      label: userName(row.assignedUserId),
      total: row._count,
      resolved: rows.filter((ticket) => ticket.resolvedAt).length,
      medianResponse: median(firstResponseHours(rows)),
      medianResolution: median(resolutionHours(rows))
    };
  });

  return (
    <>
      <PageHeader title="Analytics" eyebrow="Operations">
        <p>
          Throughput, SLA attainment and response times for tickets <strong>created</strong> in the selected window.
          All times UTC. Merged duplicates are excluded so one problem is not counted twice.
        </p>
      </PageHeader>

      <Card>
        <form className="filter-bar">
          <Field label="From">
            <TextInput name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
          </Field>
          <Field label="To">
            <TextInput name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
          </Field>
          <Button type="submit">Apply</Button>
        </form>
        <p className="muted">
          {formatDate(from)} – {formatDate(to)} &middot; {buckets.length} week(s)
        </p>
      </Card>

      {createdCount === 0 ? (
        <Card className="mt">
          <EmptyState title="No tickets created in this window">Widen the date range to see figures.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid--5" style={{ marginTop: 16 }}>
            <Metric label="Created" value={createdCount} tone="info" />
            <Metric label="Resolved" value={resolvedCount} tone="success" />
            <Metric
              label="SLA Attainment"
              value={`${sla.attainmentPct}%`}
              tone={sla.attainmentPct >= 90 ? "success" : sla.attainmentPct >= 75 ? "warning" : "danger"}
            />
            <Metric label="Median Resolution" value={hours(median(resolution))} tone="neutral" />
            <Metric label="Median 1st Response" value={hours(median(response))} tone="neutral" />
          </div>

          <Card title="Distribution" className="mt">
            <p className="muted">
              Denominator for attainment is the {sla.total} ticket(s) resolved in this window, not all {createdCount}{" "}
              created — an open ticket has neither met nor missed its SLA yet.
            </p>
            <div className="grid grid--4">
              <Metric label="SLA Met" value={sla.met} tone="success" />
              <Metric label="SLA Breached" value={sla.breached} tone={sla.breached > 0 ? "danger" : "neutral"} />
              <Metric label="p90 Resolution" value={hours(percentile(resolution, 90))} tone="neutral" />
              <Metric label="p90 1st Response" value={hours(percentile(response, 90))} tone="neutral" />
            </div>
          </Card>

          <Card title="By Team" className="mt">
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Created</th>
                  <th scope="col">Resolved</th>
                  <th scope="col">SLA Attainment</th>
                  <th scope="col">Median Resolution</th>
                </tr>
              </thead>
              <tbody>
                {perTeam.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.total}</td>
                    <td>{row.resolved}</td>
                    <td>
                      <Badge tone={row.attainment >= 90 ? "success" : row.attainment >= 75 ? "warning" : "danger"}>
                        {row.attainment}%
                      </Badge>
                    </td>
                    <td>{hours(row.medianResolution)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="By Assignee" className="mt">
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Assignee</th>
                  <th scope="col">Created</th>
                  <th scope="col">Resolved</th>
                  <th scope="col">Median 1st Response</th>
                  <th scope="col">Median Resolution</th>
                </tr>
              </thead>
              <tbody>
                {perAssignee.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.total}</td>
                    <td>{row.resolved}</td>
                    <td>{hours(row.medianResponse)}</td>
                    <td>{hours(row.medianResolution)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <p className="muted">
              Counts are by ticket <em>assignment</em>, so a ticket reassigned mid-life is attributed only to whoever
              holds it now. Ownership history is not tracked.
            </p>
          </Card>

          <Card title="Volume by Week" className="mt">
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Week Starting</th>
                  <th scope="col">Created</th>
                  <th scope="col">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucket) => {
                  const inBucket = tickets.filter(
                    (ticket) => ticket.createdAt >= bucket.start && ticket.createdAt < bucket.end
                  );
                  return (
                    <tr key={bucket.label}>
                      <td>{bucket.label}</td>
                      <td>{inBucket.length}</td>
                      <td>{inBucket.filter((ticket) => ticket.resolvedAt).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </Card>
        </>
      )}
    </>
  );
}
