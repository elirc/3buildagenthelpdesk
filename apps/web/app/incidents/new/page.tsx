import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, labelMaps } from "@agentdesk/shared";
import { createIncidentAction } from "../../../lib/actions";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function NewIncidentPage() {
  const currentUser = await requireCurrentUser();
  const users = await prisma.user.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="New Incident" eyebrow="Operations" />
      <Card>
        <form action={createIncidentAction} className="form-grid">
          <Field label="Title">
            <TextInput name="title" required />
          </Field>
          <Field label="Description">
            <TextArea name="description" required rows={7} />
          </Field>
          <div className="form-grid form-grid--2">
            <Field label="Status">
              <Select name="status" defaultValue="INVESTIGATING">
                {INCIDENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labelMaps.incidentStatus[status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select name="severity" defaultValue="SEV3">
                {INCIDENT_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Affected Service">
              <TextInput name="affectedService" required placeholder="auth-service" />
            </Field>
            <Field label="Owner">
              <Select name="ownerId" defaultValue="">
                <option value="">Unowned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="actions">
            <Button type="submit" variant="primary">Create Incident</Button>
            <Button href="/incidents">Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
