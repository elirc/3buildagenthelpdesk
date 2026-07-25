import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, Select, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { ARTICLE_STATUSES, labelMaps, TICKET_CATEGORIES } from "@agentdesk/shared";
import { hasCapability } from "@agentdesk/domain";
import { formatDate } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: { q?: string; status?: string; category?: string };
}) {
  const currentUser = await requireCurrentUser();
  const canManage = hasCapability(currentUser.role, "canned_reply:manage");

  // Search covers title, summary and tags only. The body is up to 20k
  // characters and `contains` over it would be a sequential scan of the
  // whole library; real full-text search is the follow-up.
  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      organizationId: currentUser.organizationId,
      status: searchParams.status ? (searchParams.status as never) : undefined,
      category: searchParams.category ? (searchParams.category as never) : undefined,
      ...(searchParams.q
        ? {
            OR: [
              { title: { contains: searchParams.q, mode: "insensitive" as const } },
              { summary: { contains: searchParams.q, mode: "insensitive" as const } },
              { tags: { has: searchParams.q.toLowerCase() } }
            ]
          }
        : {})
    },
    include: { author: true, _count: { select: { links: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100
  });

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        eyebrow="Support"
        actions={canManage ? <Button href="/knowledge/new" variant="primary">New Article</Button> : undefined}
      >
        <p>Reusable answers. Published articles are suggested automatically on tickets they look relevant to.</p>
      </PageHeader>

      <Card>
        <form className="filter-bar">
          <Field label="Search">
            <TextInput name="q" defaultValue={searchParams.q} placeholder="Title, summary or tag" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={searchParams.status ?? ""}>
              <option value="">All statuses</option>
              {ARTICLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelMaps.articleStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={searchParams.category ?? ""}>
              <option value="">All categories</option>
              {TICKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {labelMaps.category[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Apply</Button>
        </form>

        {articles.length === 0 ? (
          <EmptyState title="No articles found">
            Articles keep repeat answers consistent and give the suggestion engine something to offer.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Article</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Used On</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id}>
                  <td>
                    <a href={`/knowledge/${article.id}`}>{article.title}</a>
                    <div className="muted">{article.summary.slice(0, 110)}</div>
                  </td>
                  <td>{article.category ? labelMaps.category[article.category] : <span className="muted">Any</span>}</td>
                  <td>
                    <Badge tone={article.status === "PUBLISHED" ? "success" : article.status === "DRAFT" ? "info" : "neutral"}>
                      {labelMaps.articleStatus[article.status]}
                    </Badge>
                  </td>
                  <td>{article._count.links} ticket(s)</td>
                  <td>{formatDate(article.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
