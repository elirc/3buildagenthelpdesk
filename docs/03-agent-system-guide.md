# Agent System Guide

## Architecture

The agent system is local, deterministic, and fully mocked. It is designed to feel like a real agent architecture without calling OpenAI, Anthropic, LangChain, or any external API.

Core files:

- `packages/agents/src/types.ts`
- `packages/agents/src/registry.ts`
- `packages/agents/src/ticket-summarization.ts`
- `packages/agents/src/log-anomaly.ts`
- `packages/agents/src/failed-job-investigation.ts`
- `apps/web/lib/actions.ts`

## Agent Interface

Each agent has:

- `type`
- `displayName`
- `description`
- `supportedTargets`
- `run(request, context)`

The run result includes:

- summary
- findings
- recommendations
- limitations
- confidence score
- structured output
- reasoning trace

## Registry

`agentRegistry` maps `AgentType` to an agent definition. `runRegisteredAgent` validates target compatibility before executing the agent.

## Persistence

The database stores `AgentRun` records with:

- agent type
- status lifecycle
- target type and target id
- input snapshot JSON
- output JSON
- confidence score
- timestamps
- error message
- trace JSON
- created-by user

The agents themselves do not know about Prisma. This keeps them testable and replaceable.

## Deterministic Heuristics

The agents emulate LLM-like analysis with rules:

- Keyword detection
- Severity/priority scoring
- Linked evidence scoring
- Retryability classification
- Fingerprint frequency scoring
- Template-style recommendations
- Explicit limitations
- Trace steps explaining why the score changed

## Initial Agents

Ticket Summarization Agent:

- Summarizes issue and impact.
- Infers suspected category.
- Scores urgency.
- Recommends owner/team.
- Suggests escalation if needed.

Log Anomaly Detection Agent:

- Scores selected logs.
- Detects repeated fingerprints.
- Classifies auth, database, integration, and error burst patterns.
- Recommends whether an incident should exist.

Failed Job Investigation Agent:

- Classifies timeout, malformed payload, permission, and rate-limit failures.
- Recommends retry, backoff, or dead-letter review.
- Surfaces payload issues.

## Add a New Agent

1. Add an enum value to `AgentType` in `packages/shared`.
2. Add the enum value to Prisma schema.
3. Create a new file in `packages/agents/src`.
4. Implement `AgentDefinition`.
5. Register it in `packages/agents/src/registry.ts`.
6. Add a server action that builds a good input snapshot.
7. Add UI entry points.
8. Add tests.
9. Document limitations.

## Future Subagents

Subagents could be introduced by adding an orchestration layer above `runRegisteredAgent`. Keep the persisted parent run and add child run references or a `parentRunId` column. Human approval could be represented with a pending approval state before a child run mutates data.

## Limitations

- No natural language understanding beyond rules.
- No external system access.
- No tool execution.
- No model nondeterminism.
- No recursive planning yet.
- Inputs are only as good as the server action snapshot.
