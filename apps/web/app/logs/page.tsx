import { Badge, Button, Card, DataTable, Field, PageHeader, Select, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { LOG_ENVIRONMENTS, LOG_LEVELS } from "@agentdesk/shared";
import { createIncidentFromLogsAction, runLogAnomalyAction } from "../../lib/actions";
import { formatDateTime, logLevelTone } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";
import { pageHref, parsePagination } from "../../lib/pagination";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams
}: {
  searchParams: { level?: string; service?: string; environment?: string; fingerprint?: string; ticketId?: string; incidentId?: string; page?: string; pageSize?: string; from?: string; to?: string };
}) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const from = searchParams.from ? new Date(searchParams.from) : undefined;
  const to = searchParams.to ? new Date(searchParams.to) : undefined;
  const where = {
    organizationId: currentUser.organizationId,
    level: searchParams.level ? (searchParams.level as never) : undefined,
    service: searchParams.service || undefined,
    environment: searchParams.environment ? (searchParams.environment as never) : undefined,
    fingerprint: searchParams.fingerprint || undefined,
    ticketId: searchParams.ticketId || undefined,
    incidentId: searchParams.incidentId || undefined,
    timestamp: from || to ? { gte: Number.isNaN(from?.getTime()) ? undefined : from, lte: Number.isNaN(to?.getTime()) ? undefined : to } : undefined
  };

  const [logs, totalLogs, services] = await Promise.all([
    prisma.structuredLog.findMany({
      where,
      include: { ticket: true, incident: true },
      orderBy: { timestamp: "desc" },
      skip: pagination.skip,
      take: pagination.take
    }),
    prisma.structuredLog.count({ where }),
    prisma.structuredLog.findMany({
      where: { organizationId: currentUser.organizationId },
      distinct: ["service"],
      select: { service: true },
      orderBy: { service: "asc" }
    })
  ]);

  const groups = Object.values(
    logs.reduce<Record<string, { fingerprint: string; service: string; environment: string; count: number; highestLevel: string; sample: string }>>(
      (acc, log) => {
        const existing = acc[log.fingerprint];
        if (!existing) {
          acc[log.fingerprint] = {
            fingerprint: log.fingerprint,
            service: log.service,
            environment: log.environment,
            count: 1,
            highestLevel: log.level,
            sample: log.message
          };
          return acc;
        }
        existing.count += 1;
        if (["debug", "info", "warn", "error", "fatal"].indexOf(log.level) > ["debug", "info", "warn", "error", "fatal"].indexOf(existing.highestLevel)) {
          existing.highestLevel = log.level;
        }
        return acc;
      },
      {}
    )
  ).sort((a, b) => b.count - a.count);

  return (
    <>
      <PageHeader title="Log Explorer" eyebrow="Observability">
        <p>Structured application logs with service filters, fingerprint grouping, and deterministic anomaly scoring.</p>
      </PageHeader>

      <Card>
        <form className="filter-bar">
          <Field label="Service">
            <Select name="service" defaultValue={searchParams.service ?? ""}>
              <option value="">All services</option>
              {services.map((item) => (
                <option key={item.service} value={item.service}>
                  {item.service}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Environment">
            <Select name="environment" defaultValue={searchParams.environment ?? ""}>
              <option value="">All environments</option>
              {LOG_ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select name="level" defaultValue={searchParams.level ?? ""}>
              <option value="">All levels</option>
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fingerprint">
            <TextInput name="fingerprint" defaultValue={searchParams.fingerprint} />
          </Field>
          <Field label="From">
            <TextInput name="from" type="datetime-local" defaultValue={searchParams.from} />
          </Field>
          <Field label="To">
            <TextInput name="to" type="datetime-local" defaultValue={searchParams.to} />
          </Field>
          <Button type="submit">Apply</Button>
        </form>

        <form action={runLogAnomalyAction} className="actions" style={{ marginBottom: 16 }}>
          <input type="hidden" name="service" value={searchParams.service ?? ""} />
          <input type="hidden" name="environment" value={searchParams.environment ?? ""} />
          <input type="hidden" name="fingerprint" value={searchParams.fingerprint ?? ""} />
          <Button type="submit" variant="primary">Run Anomaly Agent on Current Filter</Button>
        </form>
      </Card>

      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <Card title="Error Groups">
          <DataTable>
            <thead>
              <tr>
                <th>Fingerprint</th>
                <th>Service</th>
                <th>Count</th>
                <th>Sample</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.fingerprint}>
                  <td>
                    <a href={`/logs?fingerprint=${group.fingerprint}`}>{group.fingerprint}</a>
                    <div><Badge tone={logLevelTone(group.highestLevel as never)}>{group.highestLevel}</Badge></div>
                  </td>
                  <td>{group.service}<div className="muted">{group.environment}</div></td>
                  <td>{group.count}</td>
                  <td>
                    {group.sample}
                    <form action={createIncidentFromLogsAction} style={{ marginTop: 6 }}>
                      <input type="hidden" name="fingerprint" value={group.fingerprint} />
                      <Button type="submit">Open Incident</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card title="Log Entries">
          <DataTable>
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Message</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.timestamp)}</td>
                  <td><Badge tone={logLevelTone(log.level)}>{log.level}</Badge></td>
                  <td>
                    <a href={`/logs/${log.id}`}>{log.message}</a>
                    <div className="muted">{log.service} - {log.fingerprint}</div>
                  </td>
                  <td>
                    {log.ticket ? <a href={`/tickets/${log.ticket.id}`}>Ticket</a> : <span className="muted">No ticket</span>}
                    {" / "}
                    {log.incident ? <a href={`/incidents/${log.incident.id}`}>Incident</a> : <span className="muted">No incident</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </DataTable>
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="muted">Page {pagination.page} of {Math.max(1, Math.ceil(totalLogs / pagination.pageSize))}</span>
            <Button href={pageHref("/logs", searchParams, pagination.page - 1)} disabled={pagination.page <= 1}>Previous</Button>
            <Button href={pageHref("/logs", searchParams, pagination.page + 1)} disabled={pagination.page * pagination.pageSize >= totalLogs}>Next</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
