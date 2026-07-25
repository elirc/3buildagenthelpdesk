import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, Select, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { INCIDENT_SEVERITIES, LOG_ENVIRONMENTS, LOG_LEVELS } from "@agentdesk/shared";
import { LOG_ALERT_ACTIONS, hasCapability } from "@agentdesk/domain";
import {
  createLogAlertRuleAction,
  evaluateLogAlertsNowAction,
  toggleLogAlertRuleAction
} from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function AlertsSettingsPage() {
  const currentUser = await requireCurrentUser();
  if (!hasCapability(currentUser.role, "canned_reply:manage")) {
    notFound();
  }

  const [rules, pendingEvaluation, autoIncidents] = await Promise.all([
    prisma.logAlertRule.findMany({
      where: { organizationId: currentUser.organizationId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    }),
    prisma.backgroundJob.findFirst({
      where: {
        organizationId: currentUser.organizationId,
        type: "LOG_ALERT_EVALUATION",
        status: { in: ["QUEUED", "RETRYING", "RUNNING"] }
      },
      orderBy: { runAt: "asc" }
    }),
    prisma.incident.findMany({
      where: { organizationId: currentUser.organizationId, createdByRuleId: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 5
    })
  ]);

  return (
    <>
      <PageHeader
        title="Log Alert Rules"
        eyebrow="Settings"
        actions={
          <div className="actions">
            <form action={evaluateLogAlertsNowAction}>
              <Button type="submit" variant="primary">Evaluate Now</Button>
            </form>
            <Button href="/settings">Back to Settings</Button>
          </div>
        }
      >
        <p>
          Rules watch the log stream and can open an incident by themselves. Evaluation runs as a background job that
          re-queues itself, so it only progresses while <code>npm run worker</code> is running.
        </p>
      </PageHeader>

      <Card>
        {pendingEvaluation ? (
          <p className="muted">
            Next evaluation {pendingEvaluation.runAt > new Date() ? "scheduled for" : "due since"}{" "}
            {formatDateTime(pendingEvaluation.runAt)} (job {pendingEvaluation.id.slice(0, 10)}).
          </p>
        ) : (
          <p className="text-danger">
            No evaluation is queued. Rules will not fire until one is — use Evaluate Now, or create a rule.
          </p>
        )}
      </Card>

      <Card title="Rules" className="mt">
        {rules.length === 0 ? (
          <EmptyState title="No alert rules">
            The anomaly agent already computes a score for any log window; a rule is what turns that score into an
            action nobody has to be watching for.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Matches</th>
                <th scope="col">Threshold</th>
                <th scope="col">Action</th>
                <th scope="col">Fired</th>
                <th scope="col">Last Fired</th>
                <th scope="col">Status</th>
                <th scope="col">Manage</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td className="muted">
                    {[rule.service, rule.environment, rule.level, rule.fingerprint].filter(Boolean).join(" / ") ||
                      "All logs"}
                  </td>
                  <td className="muted">
                    {rule.thresholdCount} in {rule.windowMinutes}m, score ≥ {rule.minAnomalyScore}
                  </td>
                  <td>
                    <Badge tone={rule.action === "CREATE_INCIDENT" ? "danger" : "info"}>{rule.action}</Badge>
                    {rule.action === "CREATE_INCIDENT" ? (
                      <div className="muted">{rule.incidentSeverity}</div>
                    ) : null}
                  </td>
                  <td>{rule.fireCount}</td>
                  <td>{rule.lastFiredAt ? formatDateTime(rule.lastFiredAt) : <span className="muted">Never</span>}</td>
                  <td>
                    <Badge tone={rule.isActive ? "success" : "neutral"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td>
                    <form action={toggleLogAlertRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button type="submit">{rule.isActive ? "Disable" : "Enable"}</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {autoIncidents.length > 0 ? (
        <Card title="Incidents opened by rules" className="mt">
          <DataTable>
            <tbody>
              {autoIncidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <a href={`/incidents/${incident.id}`}>{incident.title}</a>
                    <div className="muted">{formatDateTime(incident.startedAt)}</div>
                  </td>
                  <td>
                    <Badge tone="warning">Automated</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}

      <Card title="Add a rule" className="mt">
        <form action={createLogAlertRuleAction} className="form-grid">
          <div className="form-grid form-grid--2">
            <Field label="Name">
              <TextInput name="name" required placeholder="Auth errors in production" />
            </Field>
            <Field label="Service" hint="Blank matches every service.">
              <TextInput name="service" placeholder="auth-service" />
            </Field>
            <Field label="Environment">
              <Select name="environment" defaultValue="">
                <option value="">Any</option>
                {LOG_ENVIRONMENTS.map((environment) => (
                  <option key={environment} value={environment}>
                    {environment}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Level">
              <Select name="level" defaultValue="">
                <option value="">Any</option>
                {LOG_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Threshold" hint="Matching logs needed to fire.">
              <TextInput name="thresholdCount" type="number" defaultValue="5" />
            </Field>
            <Field label="Window (minutes)">
              <TextInput name="windowMinutes" type="number" defaultValue="15" />
            </Field>
            <Field label="Minimum anomaly score" hint="From the existing anomaly agent, 0-100.">
              <TextInput name="minAnomalyScore" type="number" defaultValue="70" />
            </Field>
            <Field label="Cooldown (minutes)" hint="Suppresses repeat firing while a condition persists.">
              <TextInput name="cooldownMinutes" type="number" defaultValue="60" />
            </Field>
            <Field label="Action">
              <Select name="action" defaultValue="NOTIFY_ONLY">
                {LOG_ALERT_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Incident severity" hint="Used only by CREATE_INCIDENT.">
              <Select name="incidentSeverity" defaultValue="SEV3">
                {INCIDENT_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="primary">Create Rule</Button>
        </form>
      </Card>
    </>
  );
}
