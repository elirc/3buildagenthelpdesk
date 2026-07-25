import { Badge, Card, DataTable, EmptyState, PageHeader, Select, Button, Field, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_CATEGORIES } from "@agentdesk/shared";
import { CANNED_REPLY_VARIABLES, extractVariables, hasCapability } from "@agentdesk/domain";
import { getAuthProviderName, getCurrentUser, getUsersForSwitcher, isDemoAuthEnabled } from "../../lib/auth";
import {
  createCannedReplyAction,
  updateBusinessCalendarAction,
  deactivateCannedReplyAction,
  setActiveUserAction
} from "../../lib/actions";

export const dynamic = "force-dynamic";

/** Read-only view for roles that cannot edit the calendar. */
function DescriptionListFallback(props: { start: string; end: string; days: string }) {
  return (
    <p className="muted">
      {props.days} &middot; {props.start}&ndash;{props.end} UTC. Your role cannot change these.
    </p>
  );
}

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

  const calendar = currentUser
    ? await prisma.businessCalendar.findUnique({ where: { organizationId: currentUser.organizationId } })
    : null;
  const minutesToTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const activeDays = calendar?.workdays ?? [1, 2, 3, 4, 5];

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

      <Card title="Business Hours" className="mt">
        <p className="muted">
          When set, SLA and first-response deadlines for LOW, MEDIUM and HIGH tickets count only working hours, so a
          ticket raised on Friday evening is not already late by Monday. CRITICAL always uses elapsed time — an outage
          does not wait for Monday. With no calendar configured, every priority uses elapsed time.
        </p>

        {calendar ? null : <p className="muted">No calendar configured; showing the defaults.</p>}

        {canManageReplies ? (
          <form action={updateBusinessCalendarAction} className="form-grid">
            <div className="form-grid form-grid--2">
              <Field label="Workday Start">
                <TextInput name="workdayStart" type="time" defaultValue={minutesToTime(calendar?.workdayStartMinute ?? 540)} />
              </Field>
              <Field label="Workday End">
                <TextInput name="workdayEnd" type="time" defaultValue={minutesToTime(calendar?.workdayEndMinute ?? 1020)} />
              </Field>
            </div>
            <Field label="Working Days">
              <span className="pill-list">
                {DAY_NAMES.map((name, index) => (
                  <label key={name} className="saved-view">
                    <input type="checkbox" name="workdays" value={index} defaultChecked={activeDays.includes(index)} />{" "}
                    {name.slice(0, 3)}
                  </label>
                ))}
              </span>
            </Field>
            <Field label="Holidays" hint="Comma-separated ISO dates, e.g. 2026-12-25, 2026-12-26">
              <TextInput
                name="holidays"
                defaultValue={(calendar?.holidays ?? []).map((d) => d.toISOString().slice(0, 10)).join(", ")}
              />
            </Field>
            <Field label="Timezone" hint="Stored for future use; all arithmetic is currently UTC.">
              <TextInput name="timezone" defaultValue={calendar?.timezone ?? "UTC"} />
            </Field>
            <Button type="submit" variant="primary">Save Business Hours</Button>
          </form>
        ) : (
          <DescriptionListFallback
            start={minutesToTime(calendar?.workdayStartMinute ?? 540)}
            end={minutesToTime(calendar?.workdayEndMinute ?? 1020)}
            days={activeDays.map((day) => DAY_NAMES[day]).join(", ")}
          />
        )}
      </Card>

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
