import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, DescriptionList, Field, JsonBlock, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import {
  allowedTicketTransitions,
  canMutateTickets,
  inverseTicketLinkLabel,
  linkedTicketIds,
  renderCannedReply,
  selectRepliesForTicket,
  suggestArticles,
  ticketLinkLabel,
  TICKET_LINK_TYPES
} from "@agentdesk/domain";
import { labelMaps, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@agentdesk/shared";
import { addTicketCommentAction, linkArticleToTicketAction, linkTicketsAction, mergeTicketsAction, rateArticleLinkAction, runDuplicateDetectionAction, runTicketAgentAction, unlinkTicketsAction, updateTicketAction } from "../../../lib/actions";
import { firstResponseTone, formatDateTime, formatDuration, priorityTone, slaTone, ticketStatusTone } from "../../../lib/format";
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
  const [ticket, teams, users, incidents, agentRuns, auditEvents, cannedReplies, ticketLinks, linkableTickets, publishedArticles, duplicateRun] =
    await Promise.all([
    prisma.ticket.findFirst({
      where: { id: params.id, organizationId: currentUser.organizationId },
      include: {
        assignedTeam: true,
        assignedUser: true,
        incident: true,
        mergedInto: true,
        mergedFrom: true,
        articleLinks: { include: { article: true }, orderBy: { createdAt: "desc" } },
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
    }),
    // Both directions in one query. The link is stored once; which side you
    // are on decides the wording, not whether you see it.
    prisma.ticketLink.findMany({
      where: {
        organizationId: currentUser.organizationId,
        OR: [{ sourceTicketId: params.id }, { targetTicketId: params.id }]
      },
      include: { sourceTicket: true, targetTicket: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.ticket.findMany({
      where: { organizationId: currentUser.organizationId, id: { not: params.id } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, status: true }
    }),
    prisma.knowledgeArticle.findMany({
      where: { organizationId: currentUser.organizationId, status: "PUBLISHED" },
      take: 200
    }),
    prisma.agentRun.findFirst({
      where: {
        organizationId: currentUser.organizationId,
        agentType: "DUPLICATE_DETECTION",
        targetType: "TICKET",
        targetId: params.id,
        status: "SUCCEEDED"
      },
      orderBy: { createdAt: "desc" }
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
  const firstResponse = firstResponseTone({
    firstRespondedAt: ticket.firstRespondedAt,
    firstResponseDueAt: ticket.firstResponseDueAt
  });
  const pausedSoFarMs =
    ticket.slaPausedTotalMs + (ticket.slaPausedAt ? Date.now() - ticket.slaPausedAt.getTime() : 0);

  // Templates offered here are the ones matching this ticket's category plus
  // the uncategorised ones. The filtering rule lives in the domain package so
  // it is testable without a database.
  const availableReplies = selectRepliesForTicket(cannedReplies, ticket.category);

  // Already-linked tickets are removed from the picker, so every option
  // offered is one the validator will accept.
  const alreadyLinkedIds = new Set(linkedTicketIds(ticket.id, ticketLinks));

  // The agent stores its whole AgentRunResult in `output`, so the matches
  // are two levels down. Narrowed defensively rather than cast: this JSON
  // was written by a previous version of the agent and may not match the
  // shape the current code expects.
  // Suggestions are computed per render rather than stored. The library is
  // small and the scorer is pure, so a stale suggestion is impossible -
  // editing the ticket title immediately changes what is offered.
  const attachedArticleIds = new Set(ticket.articleLinks.map((link) => link.articleId));
  const articleSuggestions = suggestArticles(
    { title: ticket.title, description: ticket.description, category: ticket.category, tags: ticket.tags },
    publishedArticles
  ).filter((entry) => !attachedArticleIds.has(entry.article.id));

  const duplicateOutput = (duplicateRun?.output as { output?: { matches?: unknown } } | null)?.output;
  const duplicateMatches = Array.isArray(duplicateOutput?.matches)
    ? (duplicateOutput.matches as Array<{ ticketId: string; title: string; similarity: number; reasons: string[] }>)
        .filter((match) => !alreadyLinkedIds.has(match.ticketId))
        .slice(0, 3)
    : [];
  const linkCandidates = linkableTickets.filter((candidate) => !alreadyLinkedIds.has(candidate.id));

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
          <div className="actions">
            <form action={runTicketAgentAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Button type="submit" variant="primary">Run Ticket Agent</Button>
            </form>
            <form action={runDuplicateDetectionAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Button type="submit">Check for Duplicates</Button>
            </form>
          </div>
        }
      >
        <div className="pill-list">
          <Badge tone={ticketStatusTone(ticket.status)}>{labelMaps.ticketStatus[ticket.status]}</Badge>
          <Badge tone={priorityTone(ticket.priority)}>{labelMaps.priority[ticket.priority]}</Badge>
          <Badge tone={sla.tone}>{sla.label}</Badge>
          {sla.paused ? <Badge tone="info">SLA Paused</Badge> : null}
          <Badge tone={firstResponse.tone}>{firstResponse.label}</Badge>
        </div>
      </PageHeader>

      {ticket.mergedIntoId ? (
        <Card>
          <p className="text-danger">
            This ticket was merged into{" "}
            <a href={`/tickets/${ticket.mergedIntoId}`}>{ticket.mergedInto?.title ?? "another ticket"}</a> on{" "}
            {formatDateTime(ticket.mergedAt)}. It is kept as the record of what the customer reported; work continues
            on the surviving ticket.
          </p>
        </Card>
      ) : null}

      {ticket.mergedFrom.length > 0 ? (
        <Card>
          <p className="muted">
            {ticket.mergedFrom.length} ticket(s) merged into this one:{" "}
            {ticket.mergedFrom.map((merged, index) => (
              <span key={merged.id}>
                {index > 0 ? ", " : ""}
                <a href={`/tickets/${merged.id}`}>{merged.title}</a>
              </span>
            ))}
          </p>
        </Card>
      ) : null}

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
                {
                  label: "First Response",
                  value: ticket.firstRespondedAt
                    ? formatDateTime(ticket.firstRespondedAt)
                    : `Due ${formatDateTime(ticket.firstResponseDueAt)}`
                },
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
              <Button type="submit" variant="primary" disabled={!writable || Boolean(ticket.mergedIntoId)}>
                Save Changes
              </Button>
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

          {duplicateMatches.length > 0 ? (
            <Card title="Possible Duplicates">
              <p className="muted">
                From the duplicate detection run on {formatDateTime(duplicateRun?.createdAt)}. Advisory only — the
                agent compares word overlap, not meaning.
              </p>
              <DataTable>
                <tbody>
                  {duplicateMatches.map((match) => (
                    <tr key={match.ticketId}>
                      <td>
                        <a href={`/tickets/${match.ticketId}`}>{match.title}</a>
                        <div className="muted">{match.reasons.join("; ")}</div>
                      </td>
                      <td>
                        <Badge tone={match.similarity >= 70 ? "warning" : "neutral"}>{match.similarity}%</Badge>
                      </td>
                      <td>
                        <form action={linkTicketsAction}>
                          <input type="hidden" name="sourceTicketId" value={ticket.id} />
                          <input type="hidden" name="targetTicketId" value={match.ticketId} />
                          <input type="hidden" name="linkType" value="DUPLICATE_OF" />
                          <Button type="submit" disabled={!writable}>Link as Duplicate</Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          ) : null}

          <Card title="Linked Tickets">
            {ticketLinks.length === 0 ? (
              <p className="muted">No linked tickets.</p>
            ) : (
              <DataTable>
                <tbody>
                  {ticketLinks.map((link) => {
                    // The stored row is directional. If this ticket is the
                    // source we show it as written; if it is the target we
                    // show the inverse wording and point at the other end.
                    const outgoing = link.sourceTicketId === ticket.id;
                    const other = outgoing ? link.targetTicket : link.sourceTicket;
                    const label = outgoing ? ticketLinkLabel(link.linkType) : inverseTicketLinkLabel(link.linkType);
                    return (
                      <tr key={link.id}>
                        <td>
                          <Badge tone="info">{label}</Badge>{" "}
                          <a href={`/tickets/${other.id}`}>{other.title}</a>
                          {link.note ? <div className="muted">{link.note}</div> : null}
                        </td>
                        <td>
                          <form action={unlinkTicketsAction}>
                            <input type="hidden" name="linkId" value={link.id} />
                            <Button type="submit" disabled={!writable}>Unlink</Button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}

            {writable && linkCandidates.length > 0 ? (
              <form action={linkTicketsAction} className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="sourceTicketId" value={ticket.id} />
                <Field label="Relationship">
                  <Select name="linkType" defaultValue="RELATED_TO">
                    {TICKET_LINK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ticketLinkLabel(type)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ticket">
                  <Select name="targetTicketId" required>
                    {linkCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note">
                  <TextInput name="note" placeholder="Optional context" />
                </Field>
                <Button type="submit">Link Ticket</Button>
              </form>
            ) : null}

            {writable && !ticket.mergedIntoId && linkCandidates.length > 0 ? (
              <form action={mergeTicketsAction} className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="sourceTicketId" value={ticket.id} />
                <Field
                  label="Merge this ticket into"
                  hint="Moves comments, logs and jobs to the survivor and closes this one. This cannot be undone."
                >
                  <Select name="targetTicketId" required>
                    {linkCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" variant="danger">Merge Ticket</Button>
              </form>
            ) : null}
          </Card>

          <Card title="Knowledge Articles">
            {ticket.articleLinks.length > 0 ? (
              <DataTable>
                <tbody>
                  {ticket.articleLinks.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <a href={`/knowledge/${link.article.id}`}>{link.article.title}</a>
                        <div className="muted">{link.article.summary.slice(0, 90)}</div>
                      </td>
                      <td>
                        {link.wasHelpful === null ? (
                          <div className="actions">
                            <form action={rateArticleLinkAction} style={{ display: "inline" }}>
                              <input type="hidden" name="linkId" value={link.id} />
                              <input type="hidden" name="wasHelpful" value="yes" />
                              <Button type="submit" disabled={!writable}>Helpful</Button>
                            </form>
                            <form action={rateArticleLinkAction} style={{ display: "inline" }}>
                              <input type="hidden" name="linkId" value={link.id} />
                              <input type="hidden" name="wasHelpful" value="no" />
                              <Button type="submit" disabled={!writable}>Not helpful</Button>
                            </form>
                          </div>
                        ) : (
                          <Badge tone={link.wasHelpful ? "success" : "warning"}>
                            {link.wasHelpful ? "Helpful" : "Not helpful"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <p className="muted">No articles attached yet.</p>
            )}

            {articleSuggestions.length > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 12 }}>
                  Suggested from the knowledge base. Advisory only &mdash; matching is on wording, category and tags,
                  not meaning.
                </p>
                <DataTable>
                  <tbody>
                    {articleSuggestions.map((entry) => (
                      <tr key={entry.article.id}>
                        <td>
                          <a href={`/knowledge/${entry.article.id}`}>{entry.article.title}</a>
                          <div className="muted">{entry.reasons.join("; ")}</div>
                        </td>
                        <td>
                          <Badge tone={entry.score >= 50 ? "warning" : "neutral"}>{entry.score}%</Badge>
                        </td>
                        <td>
                          <form action={linkArticleToTicketAction}>
                            <input type="hidden" name="ticketId" value={ticket.id} />
                            <input type="hidden" name="articleId" value={entry.article.id} />
                            <Button type="submit" disabled={!writable}>Attach</Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </>
            ) : null}
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
