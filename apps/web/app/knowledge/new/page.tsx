import { notFound } from "next/navigation";
import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { labelMaps, TICKET_CATEGORIES } from "@agentdesk/shared";
import { hasCapability } from "@agentdesk/domain";
import { createArticleAction } from "../../../lib/actions";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const currentUser = await requireCurrentUser();
  if (!hasCapability(currentUser.role, "canned_reply:manage")) {
    notFound();
  }

  return (
    <>
      <PageHeader title="New Article" eyebrow="Knowledge Base" />
      <Card>
        <form action={createArticleAction} className="form-grid">
          <Field label="Title">
            <TextInput name="title" required placeholder="Troubleshooting SAML authentication failures" />
          </Field>
          <Field label="Summary" hint="Shown in search results and used for relevance matching.">
            <TextArea name="summary" required rows={2} />
          </Field>
          <Field label="Body">
            <TextArea name="body" required rows={10} />
          </Field>
          <div className="form-grid form-grid--2">
            <Field label="Category" hint="Blank means the article can be suggested on any ticket.">
              <Select name="category" defaultValue="">
                <option value="">Any category</option>
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelMaps.category[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags">
              <TextInput name="tags" placeholder="sso, saml" />
            </Field>
          </div>
          <Field label="Status" hint="Only published articles are suggested on tickets.">
            <Select name="status" defaultValue="DRAFT">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </Select>
          </Field>
          <div className="actions">
            <Button type="submit" variant="primary">Create Article</Button>
            <Button href="/knowledge">Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
