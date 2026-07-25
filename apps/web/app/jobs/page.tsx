import { Badge, Button, Card, DataTable, EmptyState, Field, Metric, PageHeader, Select } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { JOB_STATUSES, JOB_TYPES, labelMaps } from "@agentdesk/shared";
import { JOB_LEASE_MS, workerHealth } from "@agentdesk/domain";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";
import { pageHref, parsePagination } from "../../lib/pagination";

export const dynamic = "force-dynamic";

function jobStatusTone(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "DEAD_LETTERED") return "danger" as const;
  if (status === "RETRYING" || status === "RUNNING") return "warning" as const;
  return "neutral" as const;
}

export default async function JobsPage({
  searchParams
}: {
  searchParams: { status?: string; type?: string; page?: string; pageSize?: string };
}) {
  const currentUser = await requireCurrentUser();
  const pagination = parsePagination(searchParams);
  const where = {
      organizationId: currentUser.organizationId,
      status: searchParams.status ? (searchParams.status as never) : undefined,
      type: searchParams.type ? (searchParams.type as never) : undefined
    };
  const leaseCutoff = new Date(Date.now() - JOB_LEASE_MS);

  const [jobs, totalJobs, workers, expiredLeaseCount] = await Promise.all([
    prisma.backgroundJob.findMany({
    where,
    include: {
      relatedTicket: true,
      relatedIncident: true
    },
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take
  }),
    prisma.backgroundJob.count({ where }),
    // Workers are processes, not tenants — a worker drains the whole queue,
    // so this list is deliberately not organization-scoped. It exposes no
    // customer data, only process names and counters.
    prisma.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 10 }),
    // Jobs stuck RUNNING past their lease. Should be 0 whenever a worker is
    // alive, because the worker reclaims them before each claim.
    prisma.backgroundJob.count({
      where: { organizationId: currentUser.organizationId, status: "RUNNING", lockedAt: { lt: leaseCutoff } }
    })
  ]);

  return (
    <>
      <PageHeader title="Background Jobs" eyebrow="Operations">
        <p>Queue-style job monitoring for retries, dead-letter review, and deterministic failed job investigation.</p>
      </PageHeader>

      <Card title="Worker Health">
        {workers.length === 0 ? (
          <EmptyState title="No worker has ever reported in">
            Queued jobs will sit untouched until someone runs <code>npm run worker</code>. Agent runs in particular
            stay PENDING for ever with nothing on screen explaining why.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid--3">
              <Metric
                label="Workers Seen"
                value={workers.length}
                tone={workers.some((w) => workerHealth(w) === "healthy") ? "success" : "danger"}
              />
              <Metric
                label="Expired Leases"
                value={expiredLeaseCount}
                tone={expiredLeaseCount > 0 ? "warning" : "success"}
              />
              <Metric label="Jobs Processed" value={workers.reduce((sum, w) => sum + w.processedCount, 0)} tone="info" />
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Worker</th>
                  <th scope="col">Health</th>
                  <th scope="col">Last Seen</th>
                  <th scope="col">Processed</th>
                  <th scope="col">Failed</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const health = workerHealth(worker);
                  return (
                    <tr key={worker.id}>
                      <td>{worker.workerId}</td>
                      <td>
                        <Badge tone={health === "healthy" ? "success" : health === "stale" ? "warning" : "danger"}>
                          {health}
                        </Badge>
                      </td>
                      <td>{formatDateTime(worker.lastSeenAt)}</td>
                      <td>{worker.processedCount}</td>
                      <td>{worker.failedCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </>
        )}
        {expiredLeaseCount > 0 ? (
          <p className="text-danger">
            {expiredLeaseCount} job(s) are stuck past their lease. A worker died mid-job; the next worker poll will
            return them to the queue.
          </p>
        ) : null}
      </Card>

      <Card className="mt">
        <form className="filter-bar">
          <Field label="Status">
            <Select name="status" defaultValue={searchParams.status ?? ""}>
              <option value="">All statuses</option>
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelMaps.jobStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue={searchParams.type ?? ""}>
              <option value="">All types</option>
              {JOB_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelMaps.jobType[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Apply</Button>
          <Button href="/jobs?status=FAILED">Failed Jobs</Button>
        </form>

        <DataTable>
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Error</th>
              <th>Links</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <a href={`/jobs/${job.id}`}>{labelMaps.jobType[job.type]}</a>
                  <div className="muted">{job.id.slice(0, 10)}</div>
                </td>
                <td><Badge tone={jobStatusTone(job.status)}>{labelMaps.jobStatus[job.status]}</Badge></td>
                <td>{job.attempts}/{job.maxAttempts}</td>
                <td>{job.errorMessage ?? <span className="muted">None</span>}</td>
                <td>
                  {job.relatedTicket ? <a href={`/tickets/${job.relatedTicket.id}`}>Ticket</a> : <span className="muted">No ticket</span>}
                  {" / "}
                  {job.relatedIncident ? <a href={`/incidents/${job.relatedIncident.id}`}>Incident</a> : <span className="muted">No incident</span>}
                </td>
                <td>{formatDateTime(job.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="actions" style={{ marginTop: 12 }}>
          <span className="muted">Page {pagination.page} of {Math.max(1, Math.ceil(totalJobs / pagination.pageSize))}</span>
          <Button href={pageHref("/jobs", searchParams, pagination.page - 1)} disabled={pagination.page <= 1}>Previous</Button>
          <Button href={pageHref("/jobs", searchParams, pagination.page + 1)} disabled={pagination.page * pagination.pageSize >= totalJobs}>Next</Button>
        </div>
      </Card>
    </>
  );
}
