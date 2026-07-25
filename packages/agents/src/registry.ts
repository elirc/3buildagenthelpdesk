import type { AgentDefinition, AgentRunRequest, AgentRunResult } from "./types";
import { duplicateDetectionAgent } from "./duplicate-detection";
import { failedJobInvestigationAgent } from "./failed-job-investigation";
import { logAnomalyDetectionAgent } from "./log-anomaly";
import { ticketSummarizationAgent } from "./ticket-summarization";
import type { AgentType, JsonRecord } from "@agentdesk/shared";

type RegisteredAgentDefinition = AgentDefinition<JsonRecord, JsonRecord>;

const agents: RegisteredAgentDefinition[] = [
  ticketSummarizationAgent as unknown as RegisteredAgentDefinition,
  logAnomalyDetectionAgent as unknown as RegisteredAgentDefinition,
  failedJobInvestigationAgent as unknown as RegisteredAgentDefinition,
  duplicateDetectionAgent as unknown as RegisteredAgentDefinition
];

export const agentRegistry = new Map<AgentType, RegisteredAgentDefinition>(agents.map((agent) => [agent.type, agent]));

export function getAgentDefinition(agentType: AgentType): RegisteredAgentDefinition {
  const agent = agentRegistry.get(agentType);
  if (!agent) {
    throw new Error(`No agent registered for ${agentType}`);
  }
  return agent;
}

export function listAgents(): RegisteredAgentDefinition[] {
  return Array.from(agentRegistry.values());
}

export function runRegisteredAgent(agentType: AgentType, request: AgentRunRequest): AgentRunResult {
  const agent = getAgentDefinition(agentType);
  if (!agent.supportedTargets.includes(request.targetType)) {
    throw new Error(`${agentType} does not support target ${request.targetType}`);
  }
  return agent.run(request);
}
