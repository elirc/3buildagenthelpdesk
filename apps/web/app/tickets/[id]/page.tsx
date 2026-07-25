import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, DescriptionList, Field, JsonBlock, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import {
  allowedTicketTransitions,
  canMutateTickets,
  renderCannedReply,
  selectRepliesForTicket
} from "@agentdesk/domain";
import { labelMaps, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@agentdesk/shared";
import { addTicketCommentAction, runTicketAgentAction, updateTicketAction } from "../../../lib/actions";
import { formatDateTime, formatDuration, priorityTone, slaTone, ticketStatusTone } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { replyId?: string };
}) {
  const currentUser = await requireCurrentUser();
  const [ticket, teams, users, incidents, agentRuns, auditEvents, cannedReplies] = await Promise.all([
    prisma.ticket.findFirst({
      where: { id: params.id, organizationId: currentUser.organizationId },
      include: {
        assignedTeam: true,
        assignedUser: true,
        incident: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        logs: { orderBy: { timestamp: "desc" }, take: 8 },
        jobs: { orderBy: { createdAt: "desc" }, take: 8 }
      }
    }),
    prisma.team.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } }),
    prisma.incident.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { startedAt: "desc" } }),
    prisma.agentRun.findMany({
      where: { organizationId: currentUser.organizationId, targetType: "TICKET", targetId: params.id },
      include: { createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.auditEvent.findMany({
      where: { organizationId: currentUser.organizationId, entityType: "Ticket", entityId: params.id },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.cannedReply.findMany({
      where: { organizationId: currentUser.organizationId, isActive: true },
      orderBy: { title: "asc" }
    })
  ]);

  if (!ticket) notFound();

  const writable = canMutateTickets(currentUser.role);
  const nextStatuses = Array.from(new Set([ticket.status, ...allowedTicketTransitions[ticket.status]]));
  const sla = slaTone({
    status: ticket.status,
    slaDueAt: ticket.slaDueAt,
    resolvedAt: ticket.resolvedAt,
    slaPausedAt: ticket.slaPausedAt,
    slaPausedTotalMs: ticket.slaPausedTotalMs
  });
  // Time already banked, plus the pause running right now.
  const pausedSoFarMs =
    ticket.slaPausedTotalMs + (ticket.slaPausedAt ? Date.now() - ticket.slaPausedAt.getTime() : 0);

  // Templates offered here are the ones matching this ticket's category plus
  // the uncategorised ones. The filtering rule lives in the domain package so
  // it is testable without a database.
  const availableReplies = selectRepliesForTicket(cannedReplies, ticket.category);

  // "Insert" is a GET that reloads this page with ?replyId=..., because the
  // app ships no client JavaScript. The chosen template is rendered into the
  // textarea's defaultValue, and the agent edits it before posting.
  const selectedReply = searchParams.replyId
    ? availableReplies.find((reply) => reply.id === searchParams.replyId)
    : undefined;
  const draftBody = selectedReply
    ? renderCannedReply(selectedReply.body, {
        customerName: ticket.customerName,
        ticketTitle: ticket.title,
        ticketId: ticket.id,
        agentName: currentUser.name,
        slaDueAt: formatDateTime(sla.effectiveDueAt)
      })
    : undefined;
  const latestAgentRun = agentRuns[0];

  return (
    <>
      <PageHeader
        title={ticket.title}
        eyebrow={ticket.customerName}
        actions={
          <form action={runTicketAgentAction}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <Button type="submit" variant="primary">Run Ticket Agent</Button>
          </form>
        }
      >
        <div className="pill-list">
          <Badge tone={ticketStatusTone(ticket.status)}>{labelMaps.ticketStatus[ticket.status]}</Badge>
          <Badge tone={priorityTone(ticket.priority)}>{labelMaps.priority[ticket.priority]}</Badge>
          <Badge tone={sla.tone}>{sla.label}</Badge>
          {sla.paused ? <Badge tone="info">SLA Paused</Badge> : null}
        </div>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Ticket Details">
            <DescriptionList
              items={[
                { label: "Requester", value: ticket.requesterEmail },
                { label: "Category", value: labelMaps.category[ticket.category] },
                { label: "Assigned Team", value: ticket.assignedTeam?.name ?? "Unassigned" },
                { label: "Assigned User", value: ticket.assignedUser?.name ?? "Unassigned" },
                // Both deadlines are shown. The original is the commitment
                // made when the ticket was raised; the effective one is what
                // the ticket is actually judged against. Showing only the
                // second would make the SLA look like it moved on its own.
                { label: "SLA Due (original)", value: formatDateTime(ticket.slaDueAt) },
                {
                  label: "SLA Due (effective)",
                  value: (
                    <>
                      {formatDateTime(sla.effectiveDueAt)}
                      {sla.paused ? <div className="muted">Clock stopped &mdash; waiting on customer</div> : null}
                    </>
                  )
                },
                { label: "Customer Wait", value: formatDuration(pausedSoFarMs) },
                { label: "Incident", value: ticket.incident ? <a href={`/incidents/${ticket.incident.id}`}>{ticket.incident.title}</a> : "None" }
              ]}
            />
            <p>{ticket.description}</p>
            <div className="pill-list">
              {ticket.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </Card>

          <Card title="Edit Ticket">
            <form action={updateTicketAction} className="form-grid">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Field label="Title">
                <TextInput name="title" defaultValue={ticket.title} required />
              </Field>
              <Field label="Description">
                <TextArea name="description" defaultValue={ticket.description} required rows={6} />
              </Field>
              <div className="form-grid form-grid--2">
                <Field label="Customer">
                  <TextInput name="customerName" defaultValue={ticket.customerName} required />
                </Field>
                <Field label="Requester Email">
                  <TextInput name="requesterEmail" defaultValue={ticket.requesterEmail} required type="email" />
                </Field>
                <Field label="Status">
                  <Select name="status" defaultValue={ticket.status}>
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {labelMaps.ticketStatus[status]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select name="priority" defaultValue={ticket.priority}>
                    {TICKET_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {labelMaps.priority[priority]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue={ticket.category}>
                    {TICKET_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {labelMaps.category[category]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tags">
                  <TextInput name="tags" defaultValue={ticket.tags.join(", ")} />
                </Field>
                <Field label="Assigned Team">
                  <Select name="assignedTeamId" defaultValue={ticket.assignedTeamId ?? ""}>
                    <option value="">Unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assigned User">
                  <Select name="assignedUserId" defaultValue={ticket.assignedUserId ?? ""}>
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Linked Incident">
                  <Select name="incidentId" defaultValue={ticket.incidentId ?? ""}>
                    <option value="">None</option>
                    {incidents.map((incident) => (
                      <option key={incident.id} value={incident.id}>
                        {incident.severity} - {incident.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="primary" disabled={!writable}>Save Changes</Button>
            </form>
          </Card>

          <Card title="Comments and Internal Notes">
            <div className="timeline">
              {ticket.comments.map((comment) => (
                <div className="timeline-item" key={comment.id}>
                  <time>{formatDateTime(comment.createdAt)}</time>
                  <strong>{comment.author.name}</strong> <Badge tone={comment.isInternal ? "warning" : "info"}>{comment.isInternal ? "Internal" : "Customer"}</Badge>
                  <p>{comment.body}</p>
                </div>
              ))}
            </div>
            {availableReplies.length > 0 ? (
              <form method="get" className="filter-bar" style={{ marginTop: 16 }}>
                <Field label="Reply Template">
                  <Select name="replyId" defaultValue={searchParams.replyId ?? ""}>
                    <option value="">Start from scratch</option>
                    {availableReplies.map((reply) => (
                      <option key={reply.id} value={reply.id}>
                        {reply.title}
                        {reply.category ? ` (${labelMaps.category[reply.category]})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit">Insert</Button>
              </form>
            ) : null}

            <form action={addTicketCommentAction} className="form-grid" style={{ marginTop: 16 }}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              {selectedReply ? <input type="hidden" name="cannedReplyId" value={selectedReply.id} /> : null}
              <Field label="Add Note">
                {/* `key` forces React to rebuild the textarea when a different
                    template is chosen. Without it the element is reused and
                    defaultValue — which only applies on mount — is ignored,
                    so picking a second template would appear to do nothing. */}
                <TextArea key={selectedReply?.id ?? "blank"} name="body" rows={4} defaultValue={draftBody} />
              </Field>
              <label>
                <input type="checkbox" name="isInternal" defaultChecked /> Internal note
              </label>
              <Button type="submit" disabled={!writable}>Add Note</Button>
            </form>
          </Card>
        </div>

        <div className="grid">
          <Card title="Agent Summary">
            {latestAgentRun ? (
              <>
                <DescriptionList
                  items={[
                    { label: "Agent", value: labelMaps.agentType[latestAgentRun.agentType] },
                    { label: "Status", value: latestAgentRun.status },
                    { label: "Confidence", value: latestAgentRun.confidenceScore == null ? "Pending" : `${Math.round(latestAgentRun.confidenceScore)}%` },
                    { label: "Run At", value: formatDateTime(latestAgentRun.createdAt) }
                  ]}
                />
                <div style={{ marginTop: 12 }}>
                  <Button href={`/agents/${latestAgentRun.id}`}>Open Run</Button>
                </div>
              </>
            ) : (
              <p className="muted">No agent run yet.</p>
            )}
          </Card>

          <Card title="Linked Logs">
            <DataTable>
              <tbody>
                {ticket.logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <a href={`/logs/${log.id}`}>{log.message}</a>
                      <div className="muted">{log.service} - {formatDateTime(log.timestamp)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="Related Jobs">
            <DataTable>
              <tbody>
                {ticket.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <a href={`/jobs/${job.id}`}>{labelMaps.jobType[job.type]}</a>
                      <div className="muted">{labelMaps.jobStatus[job.status]} - {job.attempts}/{job.maxAttempts}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title="Audit History">
            <div className="timeline">
              {auditEvents.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <time>{formatDateTime(event.createdAt)}</time>
                  <strong>{event.action}</strong>
                  <p className="muted">{event.actor?.name ?? "System"}</p>
                </div>
              ))}
            </div>
          </Card>

          {latestAgentRun?.output ? (
            <Card title="Latest Agent Output">
              <JsonBlock value={latestAgentRun.output} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
