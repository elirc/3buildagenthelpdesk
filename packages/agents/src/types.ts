import type { AgentTargetType, AgentType, JsonRecord } from "@agentdesk/shared";

export type AgentTraceStep = {
  step: string;
  observation: string;
  scoreDelta?: number;
  data?: JsonRecord;
};

export type AgentContext = {
  runId?: string;
  createdByUserId?: string;
  now?: Date;
};

export type AgentRunRequest<TInput extends JsonRecord = JsonRecord> = {
  targetType: AgentTargetType;
  targetId: string;
  input: TInput;
};

export type AgentRunResult<TOutput extends JsonRecord = JsonRecord> = {
  agentType: AgentType;
  summary: string;
  findings: string[];
  recommendations: string[];
  limitations: string[];
  confidenceScore: number;
  output: TOutput;
  trace: AgentTraceStep[];
};

export type AgentDefinition<TInput extends JsonRecord = JsonRecord, TOutput extends JsonRecord = JsonRecord> = {
  type: AgentType;
  displayName: string;
  description: string;
  version: string;
  supportedTargets: AgentTargetType[];
  run: (request: AgentRunRequest<TInput>, context?: AgentContext) => AgentRunResult<TOutput>;
};
