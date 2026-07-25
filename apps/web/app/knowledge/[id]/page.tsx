import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, DescriptionList, Field, PageHeader, Select } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { allowedArticleTransitions, hasCapability } from "@agentdesk/domain";
import { changeArticleStatusAction } from "../../../lib/actions";
import { formatDate, formatDateTime } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await requireCurrentUser();

  const article = await prisma.knowledgeArticle.findFirst({
    where: { id: params.id, organizationId: currentUser.organizationId },
    include: {
      author: true,
      links: { include: { ticket: true, linkedBy: true }, orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!article) notFound();

  const canManage = hasCapability(currentUser.role, "canned_reply:manage");
  const nextStatuses = Array.from(new Set([article.status, ...allowedArticleTransitions[article.status]]));

  const helpful = article.links.filter((link) => link.wasHelpful === true).length;
  const unhelpful = article.links.filter((link) => link.wasHelpful === false).length;

  return (
    <>
      <PageHeader title={article.title} eyebrow="Knowledge Base" actions={<Button href="/knowledge">All Articles</Button>}>
        <div className="pill-list">
          <Badge tone={article.status === "PUBLISHED" ? "success" : article.status === "DRAFT" ? "info" : "neutral"}>
            {labelMaps.articleStatus[article.status]}
          </Badge>
          {article.category ? <Badge>{labelMaps.category[article.category]}</Badge> : null}
          {article.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </PageHeader>

      <div className="detail-grid">
        <div className="grid">
          <Card title="Article">
            <p className="muted">{article.summary}</p>
            {/* Rendered as preformatted text, never as markup. Article
                bodies are authored by users and React escapes this; there
                is no dangerouslySetInnerHTML anywhere in the app. */}
            <pre className="json-block">{article.body}</pre>
          </Card>

          {canManage ? (
            <Card title="Change Status">
              <form action={changeArticleStatusAction} className="actions">
                <input type="hidden" name="articleId" value={article.id} />
                <Field label="Status">
                  <Select name="status" defaultValue={article.status}>
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {labelMaps.articleStatus[status]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" variant="primary">Save</Button>
              </form>
              <p className="muted">
                Archived articles can only return to draft, never straight back to published &mdash; reviving something
                retired for being wrong should be deliberate.
              </p>
            </Card>
          ) : null}
        </div>

        <div className="grid">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Author", value: article.author?.name ?? "Unknown" },
                { label: "Created", value: formatDate(article.createdAt) },
                { label: "Published", value: article.publishedAt ? formatDate(article.publishedAt) : "Not published" },
                { label: "Attached to", value: `${article.linkCount} ticket(s)` },
                {
                  label: "Helpful",
                  value:
                    helpful + unhelpful === 0 ? (
                      <span className="muted">No ratings yet</span>
                    ) : (
                      `${helpful} yes / ${unhelpful} no`
                    )
                }
              ]}
            />
          </Card>

          <Card title="Used on tickets">
            {article.links.length === 0 ? (
              <p className="muted">Not yet attached to any ticket.</p>
            ) : (
              <DataTable>
                <tbody>
                  {article.links.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <a href={`/tickets/${link.ticket.id}`}>{link.ticket.title}</a>
                        <div className="muted">
                          {link.linkedBy?.name ?? "Unknown"} &middot; {formatDateTime(link.createdAt)}
                        </div>
                      </td>
                      <td>
                        {link.wasHelpful === null ? (
                          <span className="muted">Unrated</span>
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
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
