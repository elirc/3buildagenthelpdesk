import { Badge, Button, Card, DataTable, Field, PageHeader, Select } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { JOB_STATUSES, JOB_TYPES, labelMaps } from "@agentdesk/shared";
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
  const [jobs, totalJobs] = await Promise.all([
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
    prisma.backgroundJob.count({ where })
  ]);

  return (
    <>
      <PageHeader title="Background Jobs" eyebrow="Operations">
        <p>Queue-style job monitoring for retries, dead-letter review, and deterministic failed job investigation.</p>
      </PageHeader>

      <Card>
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
