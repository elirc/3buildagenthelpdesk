import { Badge, Card, DataTable, PageHeader, Select, Button, Field } from "@agentdesk/ui";
import { labelMaps } from "@agentdesk/shared";
import { getAuthProviderName, getCurrentUser, getUsersForSwitcher, isDemoAuthEnabled } from "../../lib/auth";
import { setActiveUserAction } from "../../lib/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [currentUser, users] = await Promise.all([getCurrentUser(), getUsersForSwitcher()]);
  const demoAuth = isDemoAuthEnabled();

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
    </>
  );
}
