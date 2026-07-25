import { Badge, Button, Card, DataTable, EmptyState, Field, Metric, PageHeader, TextArea } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { MAX_REQUEUES, canRequeueJob, groupDeadLetters, hasCapability } from "@agentdesk/domain";
import { requeueDeadLetterJobsAction } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DeadLetterPage({
  searchParams
}: {
  searchParams: { requeued?: string; blocked?: string };
}) {
  const currentUser = await requireCurrentUser();

  const jobs = await prisma.backgroundJob.findMany({
    where: { organizationId: currentUser.organizationId, status: "DEAD_LETTERED" },
    include: { relatedTicket: true, relatedIncident: true },
    orderBy: { createdAt: "desc" },
    take: 500
  });

  // Grouping happens in the domain package, so 200 near-identical failures
  // become a handful of rows an operator can actually reason about.
  const groups = groupDeadLetters(jobs);
  const canRequeue = hasCapability(currentUser.role, "job:retry");
  const exhausted = jobs.filter((job) => !canRequeueJob(job)).length;

  return (
    <>
      <PageHeader title="Dead Letter Queue" eyebrow="Operations" actions={<Button href="/jobs">All Jobs</Button>}>
        <p>
          Jobs that exhausted their retries and need a human. Grouped by failure shape so an outage that killed two
          hundred jobs reads as one problem rather than two hundred.
        </p>
      </PageHeader>

      {searchParams.requeued ? (
        <Card>
          <p className={searchParams.blocked ? "text-danger" : "muted"}>
            {searchParams.requeued} job(s) requeued
            {searchParams.blocked ? `, ${searchParams.blocked} skipped (requeue limit reached)` : ""}.
          </p>
        </Card>
      ) : null}

      <div className="grid grid--3">
        <Metric label="Dead Lettered" value={jobs.length} tone={jobs.length > 0 ? "danger" : "success"} />
        <Metric label="Distinct Failures" value={groups.length} tone="info" />
        <Metric label="Past Requeue Limit" value={exhausted} tone={exhausted > 0 ? "warning" : "neutral"} />
      </div>

      {groups.length === 0 ? (
        <Card className="mt">
          <EmptyState title="Nothing in the dead letter queue">
            Jobs arrive here after exhausting their retry budget.
          </EmptyState>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key} title={`${labelMaps.jobType[group.type]} — ${group.count} job(s)`} className="mt">
            <p className="muted">{group.normalizedError}</p>

            <form action={requeueDeadLetterJobsAction} className="form-grid">
              <DataTable>
                <thead>
                  <tr>
                    {canRequeue ? <th scope="col" aria-label="Select" /> : null}
                    <th scope="col">Job</th>
                    <th scope="col">Error</th>
                    <th scope="col">Requeues</th>
                    <th scope="col">Links</th>
                    <th scope="col">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {group.jobs.map((job) => {
                    const eligible = canRequeueJob(job);
                    return (
                      <tr key={job.id}>
                        {canRequeue ? (
                          <td>
                            <input
                              type="checkbox"
                              name="jobIds"
                              value={job.id}
                              disabled={!eligible}
                              aria-label={`Select job ${job.id}`}
                            />
                          </td>
                        ) : null}
                        <td>
                          <a href={`/jobs/${job.id}`}>{job.id.slice(0, 10)}</a>
                        </td>
                        <td className="muted">{job.errorMessage ?? "None"}</td>
                        <td>
                          {eligible ? (
                            `${job.requeueCount}/${MAX_REQUEUES}`
                          ) : (
                            <Badge tone="warning">Limit reached</Badge>
                          )}
                        </td>
                        <td>
                          {job.relatedTicket ? <a href={`/tickets/${job.relatedTicket.id}`}>Ticket</a> : null}
                          {job.relatedIncident ? <a href={`/incidents/${job.relatedIncident.id}`}> Incident</a> : null}
                          {!job.relatedTicket && !job.relatedIncident ? <span className="muted">None</span> : null}
                        </td>
                        <td>{formatDateTime(job.finishedAt ?? job.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>

              {canRequeue ? (
                <>
                  <Field
                    label="Why are these safe to retry?"
                    hint="Recorded on each job and in the audit log. Minimum 10 characters."
                  >
                    <TextArea name="reason" rows={2} required placeholder="Vendor gateway recovered at 14:20; retrying stuck deliveries." />
                  </Field>
                  <Button type="submit" variant="primary">Requeue Selected</Button>
                </>
              ) : (
                <p className="muted">Your role can review the dead letter queue but not requeue jobs.</p>
              )}
            </form>
          </Card>
        ))
      )}
    </>
  );
}
