import type { Metadata } from "next";
import "@agentdesk/ui/styles.css";
import { Badge } from "@agentdesk/ui";
import { labelMaps } from "@agentdesk/shared";
import { getCurrentUser, getUsersForSwitcher, isDemoAuthEnabled } from "../lib/auth";
import { setActiveUserAction } from "../lib/actions";

export const metadata: Metadata = {
  title: "Agentic Help Desk",
  description: "Internal help desk, incident intelligence, and deterministic agent workflow platform."
};

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/incidents", label: "Incidents" },
  { href: "/logs", label: "Logs" },
  { href: "/jobs", label: "Jobs" },
  { href: "/agents", label: "Agent Runs" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/analytics", label: "Analytics" },
  { href: "/audit", label: "Audit Events" },
  { href: "/settings", label: "Settings" }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [currentUser, users] = await Promise.all([getCurrentUser(), getUsersForSwitcher()]);
  const demoAuth = isDemoAuthEnabled();

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <strong>Agentic Help Desk</strong>
              <span>Incident intelligence platform</span>
            </div>
            <nav className="nav" aria-label="Main navigation">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <main className="main">
            <div className="topbar">
              {currentUser ? (
                <>
                  <Badge tone="info">{labelMaps.role[currentUser.role]}</Badge>
                  <Badge>{currentUser.organization.slug}</Badge>
                  {demoAuth ? (
                    <form action={setActiveUserAction}>
                      <select className="input select" name="userId" defaultValue={currentUser.id} onChange={undefined}>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} - {user.organization.slug}
                          </option>
                        ))}
                      </select>
                      <button className="button button--secondary" type="submit">
                        Switch
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <Badge tone="warning">Authentication required</Badge>
              )}
            </div>
            <div className="content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
