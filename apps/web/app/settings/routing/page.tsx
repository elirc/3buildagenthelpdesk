import { notFound } from "next/navigation";
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, Select, TextArea, TextInput } from "@agentdesk/ui";
import { prisma } from "@agentdesk/db";
import { labelMaps, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@agentdesk/shared";
import {
  ROUTING_CONDITION_FIELDS,
  ROUTING_OPERATORS,
  evaluateRoutingRules,
  hasCapability,
  type EvaluableRule,
  type RoutingCondition
} from "@agentdesk/domain";
import {
  createRoutingRuleAction,
  deleteRoutingRuleAction,
  toggleRoutingRuleAction
} from "../../../lib/actions";
import { requireCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

const CONDITION_SLOTS = [0, 1, 2];

export default async function RoutingSettingsPage({
  searchParams
}: {
  searchParams: { testTitle?: string; testDescription?: string; testCategory?: string; testEmail?: string; testTags?: string };
}) {
  const currentUser = await requireCurrentUser();
  if (!hasCapability(currentUser.role, "canned_reply:manage")) {
    notFound();
  }

  const [rules, teams, users] = await Promise.all([
    prisma.routingRule.findMany({
      where: { organizationId: currentUser.organizationId },
      include: { assignTeam: true, assignUser: true },
      orderBy: [{ priorityOrder: "asc" }, { name: "asc" }]
    }),
    prisma.team.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: currentUser.organizationId }, orderBy: { name: "asc" } })
  ]);

  const evaluable: EvaluableRule[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    priorityOrder: rule.priorityOrder,
    isActive: rule.isActive,
    conditions: (rule.conditions as unknown as RoutingCondition[]) ?? [],
    assignTeamId: rule.assignTeamId,
    assignUserId: rule.assignUserId,
    setPriority: rule.setPriority,
    addTags: rule.addTags
  }));

  // The dry run is a GET and writes nothing. It exists because "why did
  // that ticket go there" is otherwise unanswerable without creating a
  // real ticket to find out.
  const testing = Boolean(searchParams.testTitle || searchParams.testDescription);
  const decision = testing
    ? evaluateRoutingRules(
        {
          title: searchParams.testTitle ?? "",
          description: searchParams.testDescription ?? "",
          category: (searchParams.testCategory as never) || "OTHER",
          priority: "MEDIUM",
          tags: (searchParams.testTags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
          requesterEmail: searchParams.testEmail ?? "someone@example.com"
        },
        evaluable
      )
    : null;

  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name ?? null;

  return (
    <>
      <PageHeader title="Routing Rules" eyebrow="Settings" actions={<Button href="/settings">Back to Settings</Button>}>
        <p>
          Rules run in order when a ticket is created with no team or assignee chosen. The first rule whose conditions
          all match wins; an explicit choice on the create form always beats a rule.
        </p>
      </PageHeader>

      <Card title="Rules in evaluation order">
        {rules.length === 0 ? (
          <EmptyState title="No routing rules yet">
            Without rules, new tickets stay unassigned until someone picks them up.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Rule</th>
                <th scope="col">Conditions</th>
                <th scope="col">Action</th>
                <th scope="col">Matches</th>
                <th scope="col">Status</th>
                <th scope="col">Manage</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.priorityOrder}</td>
                  <td>{rule.name}</td>
                  <td className="muted">
                    {((rule.conditions as unknown as RoutingCondition[]) ?? [])
                      .map((condition) => `${condition.field} ${condition.operator} "${condition.value}"`)
                      .join(" AND ") || "None"}
                  </td>
                  <td className="muted">
                    {rule.assignTeam ? `Team: ${rule.assignTeam.name}` : null}
                    {rule.assignUser ? ` User: ${rule.assignUser.name}` : null}
                    {rule.setPriority ? ` Priority: ${labelMaps.priority[rule.setPriority]}` : null}
                    {rule.addTags.length > 0 ? ` Tags: ${rule.addTags.join(", ")}` : null}
                  </td>
                  <td>{rule.matchCount}</td>
                  <td>
                    <Badge tone={rule.isActive ? "success" : "neutral"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td>
                    <form action={toggleRoutingRuleAction} style={{ display: "inline" }}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button type="submit">{rule.isActive ? "Disable" : "Enable"}</Button>
                    </form>
                    <form action={deleteRoutingRuleAction} style={{ display: "inline" }}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button type="submit" variant="danger">Delete</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      <Card title="Test a ticket against these rules" className="mt">
        <p className="muted">Writes nothing. Shows which rule would fire and why the others did not.</p>
        <form method="get" className="form-grid">
          <div className="form-grid form-grid--2">
            <Field label="Title">
              <TextInput name="testTitle" defaultValue={searchParams.testTitle} placeholder="SSO login failing" />
            </Field>
            <Field label="Requester Email">
              <TextInput name="testEmail" defaultValue={searchParams.testEmail} placeholder="it@acme.example" />
            </Field>
            <Field label="Category">
              <Select name="testCategory" defaultValue={searchParams.testCategory ?? "OTHER"}>
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelMaps.category[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags">
              <TextInput name="testTags" defaultValue={searchParams.testTags} placeholder="sso, production" />
            </Field>
          </div>
          <Field label="Description">
            <TextArea name="testDescription" rows={2} defaultValue={searchParams.testDescription} />
          </Field>
          <Button type="submit">Evaluate</Button>
        </form>

        {decision ? (
          <>
            <p>
              {decision.matchedRuleId ? (
                <>
                  Would match <strong>{decision.matchedRuleName}</strong>
                  {teamName(decision.assignTeamId ?? null) ? ` → ${teamName(decision.assignTeamId ?? null)}` : ""}.
                </>
              ) : (
                <span className="muted">No rule would match; the ticket would stay unassigned.</span>
              )}
            </p>
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Result</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {decision.evaluated.map((entry) => (
                  <tr key={entry.ruleId}>
                    <td>{entry.ruleName}</td>
                    <td>
                      <Badge tone={entry.matched ? "success" : "neutral"}>{entry.matched ? "Matched" : "No match"}</Badge>
                    </td>
                    <td className="muted">{entry.skippedReason ?? entry.failedCondition ?? "All conditions met"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {decision.matchedRuleId ? (
              <p className="muted">Rules after the match were not evaluated — the first match wins.</p>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card title="Add a rule" className="mt">
        <form action={createRoutingRuleAction} className="form-grid">
          <div className="form-grid form-grid--2">
            <Field label="Name">
              <TextInput name="name" required placeholder="Access issues to engineering" />
            </Field>
            <Field label="Evaluation Order" hint="Lower runs first.">
              <TextInput name="priorityOrder" type="number" defaultValue="100" />
            </Field>
          </div>

          {CONDITION_SLOTS.map((slot) => (
            <div className="form-grid form-grid--2" key={slot}>
              <Field label={`Condition ${slot + 1} field`}>
                <Select name="conditionField" defaultValue="CATEGORY">
                  {ROUTING_CONDITION_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Operator">
                <Select name="conditionOperator" defaultValue="equals">
                  {ROUTING_OPERATORS.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Value" hint={slot === 0 ? "At least one condition is required." : "Leave blank to skip."}>
                <TextInput name="conditionValue" placeholder={slot === 0 ? "ACCESS" : ""} />
              </Field>
            </div>
          ))}

          <div className="form-grid form-grid--2">
            <Field label="Assign Team">
              <Select name="assignTeamId" defaultValue="">
                <option value="">No team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assign User">
              <Select name="assignUserId" defaultValue="">
                <option value="">No user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Set Priority">
              <Select name="setPriority" defaultValue="">
                <option value="">Leave unchanged</option>
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {labelMaps.priority[priority]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Add Tags">
              <TextInput name="addTags" placeholder="auto-routed" />
            </Field>
          </div>

          <Button type="submit" variant="primary">Create Rule</Button>
        </form>
      </Card>
    </>
  );
}
