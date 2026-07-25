import { Badge, Card, DataTable, EmptyState, PageHeader, Select, Button, Field, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_CATEGORIES } from "@agentdesk/shared";
import { CANNED_REPLY_VARIABLES, extractVariables, hasCapability } from "@agentdesk/domain";
import { getAuthProviderName, getCurrentUser, getUsersForSwitcher, isDemoAuthEnabled } from "../../lib/auth";
import {
  createCannedReplyAction,
  deactivateCannedReplyAction,
  setActiveUserAction
} from "../../lib/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [currentUser, users] = await Promise.all([getCurrentUser(), getUsersForSwitcher()]);
  const demoAuth = isDemoAuthEnabled();

  // Templates are organization-scoped like everything else. A user with no
  // resolved session sees none rather than everyone's.
  const cannedReplies = currentUser
    ? await prisma.cannedReply.findMany({
        where: { organizationId: currentUser.organizationId },
        include: { createdBy: true },
        orderBy: [{ isActive: "desc" }, { title: "asc" }]
      })
    : [];
  const canManageReplies = currentUser ? hasCapability(currentUser.role, "canned_reply:manage") : false;

  return (
    <>
      <PageHeader title="Settings" eyebrow="Authentication and access">
        <p>Active provider: {getAuthProviderName()}. Demo user switching is {demoAuth ? "enabled" : "disabled"}.</p>
      </PageHeader>
      <div className="grid grid--2">
        <Card title="Active User">
          {demoAuth ? (
            <form action={setActiveUserAction} className="form-grid">
              <Field label="User">
                <Select name="userId" defaultValue={currentUser?.id}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {labelMaps.role[user.role]} - {user.organization.slug}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary">Switch User</Button>
            </form>
          ) : (
            <p className="muted">Local user switching is disabled for this authentication mode.</p>
          )}
        </Card>

        <Card title="Seeded Users">
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Organization</th>
                <th>Role</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}<div className="muted">{user.email}</div></td>
                  <td>{user.organization.name}</td>
                  <td><Badge tone="info">{labelMaps.role[user.role]}</Badge></td>
                  <td>{user.team?.name ?? "No team"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>

      <Card title="Reply Templates" className="mt">
        <p className="muted">
          Shared responses agents can insert into a ticket. Placeholders are filled in from the ticket when the
          template is used. Available placeholders:{" "}
          {CANNED_REPLY_VARIABLES.map((variable) => `{{${variable}}}`).join(", ")}.
        </p>

        {cannedReplies.length === 0 ? (
          <EmptyState title="No reply templates yet">
            Templates keep common answers consistent and save retyping the same reply.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Applies To</th>
                <th scope="col">Placeholders</th>
                <th scope="col">Used</th>
                <th scope="col">Status</th>
                {canManageReplies ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {cannedReplies.map((reply) => (
                <tr key={reply.id}>
                  <td>
                    {reply.title}
                    <div className="muted">{reply.body.slice(0, 90)}{reply.body.length > 90 ? "…" : ""}</div>
                  </td>
                  <td>{reply.category ? labelMaps.category[reply.category] : <span className="muted">All categories</span>}</td>
                  <td className="muted">{extractVariables(reply.body).join(", ") || "None"}</td>
                  <td>{reply.usageCount}</td>
                  <td>
                    <Badge tone={reply.isActive ? "success" : "neutral"}>{reply.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManageReplies ? (
                    <td>
                      <form action={deactivateCannedReplyAction}>
                        <input type="hidden" name="cannedReplyId" value={reply.id} />
                        <Button type="submit">{reply.isActive ? "Deactivate" : "Reactivate"}</Button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {canManageReplies ? (
          <form action={createCannedReplyAction} className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-grid form-grid--2">
              <Field label="Title">
                <TextInput name="title" required placeholder="Acknowledge and ask for reproduction steps" />
              </Field>
              <Field label="Applies To">
                <Select name="category" defaultValue="">
                  <option value="">All categories</option>
                  {TICKET_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {labelMaps.category[category]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Body" hint="Use {{customerName}}, {{agentName}} and the other placeholders listed above.">
              <TextArea name="body" required rows={5} />
            </Field>
            <Button type="submit" variant="primary">Create Template</Button>
          </form>
        ) : (
          <p className="muted">Your role can use reply templates but not author them.</p>
        )}
      </Card>
    </>
  );
}
