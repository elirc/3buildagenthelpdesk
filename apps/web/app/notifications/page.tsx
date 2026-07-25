import { Badge, Button, Card, DataTable, EmptyState, PageHeader } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps } from "@agentdesk/shared";
import { markNotificationsReadAction } from "../../lib/actions";
import { formatDateTime } from "../../lib/format";
import { requireCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const currentUser = await requireCurrentUser();

  // Scoped to recipientId, not organizationId. A notification belongs to a
  // person, and org membership alone must not make someone else's inbox
  // readable.
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.notification.count({ where: { recipientId: currentUser.id, readAt: null } })
  ]);

  const hrefFor = (entityType: string, entityId: string) =>
    entityType === "Incident" ? `/incidents/${entityId}` : `/tickets/${entityId}`;

  return (
    <>
      <PageHeader
        title="Notifications"
        eyebrow="Inbox"
        actions={
          unreadCount > 0 ? (
            <form action={markNotificationsReadAction}>
              <Button type="submit" variant="primary">Mark all read</Button>
            </form>
          ) : undefined
        }
      >
        <p>Changes to tickets and incidents you watch, are assigned, or own. Your own actions are never included.</p>
      </PageHeader>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState title="Nothing here yet">
            Watch a ticket or incident from its page and changes will show up here.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Notification</th>
                <th scope="col">Type</th>
                <th scope="col">When</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.id}>
                  <td>
                    <a href={hrefFor(notification.entityType, notification.entityId)}>
                      <strong>{notification.title}</strong>
                    </a>
                    <div className="muted">{notification.body}</div>
                  </td>
                  <td className="muted">{labelMaps.notificationKind[notification.kind]}</td>
                  <td>{formatDateTime(notification.createdAt)}</td>
                  <td>
                    {notification.readAt ? (
                      <span className="muted">Read</span>
                    ) : (
                      <form action={markNotificationsReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <Button type="submit">Mark read</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
