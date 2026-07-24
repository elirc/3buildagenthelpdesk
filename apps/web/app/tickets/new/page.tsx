import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@agentdesk/shared";
import { createTicketAction } from "../../../lib/actions";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const currentUser = await requireCurrentUser();
  const [teams, users, incidents] = await Promise.all([
    prisma.team.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } }),
    prisma.incident.findMany({ where: { organizationId: currentUser.organizationId, status: { not: "RESOLVED" } }, orderBy: { startedAt: "desc" } })
  ]);

  return (
    <>
      <PageHeader title="New Ticket" eyebrow="Help desk" />
      <Card>
        <form action={createTicketAction} className="form-grid">
          <div className="form-grid form-grid--2">
            <Field label="Title">
              <TextInput name="title" required />
            </Field>
            <Field label="Customer">
              <TextInput name="customerName" required />
            </Field>
          </div>
          <Field label="Description">
            <TextArea name="description" required rows={7} />
          </Field>
          <div className="form-grid form-grid--2">
            <Field label="Requester Email">
              <TextInput name="requesterEmail" type="email" required />
            </Field>
            <Field label="Tags">
              <TextInput name="tags" placeholder="sso, production, incident" />
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM" required>
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {labelMaps.priority[priority]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue="OTHER" required>
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelMaps.category[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned Team">
              <Select name="assignedTeamId" defaultValue="">
                <option value="">Unassigned</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned User">
              <Select name="assignedUserId" defaultValue="">
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Linked Incident">
              <Select name="incidentId" defaultValue="">
                <option value="">None</option>
                {incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.severity} - {incident.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="actions">
            <Button type="submit" variant="primary">Create Ticket</Button>
            <Button href="/tickets">Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
