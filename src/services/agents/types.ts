import { CoTProgressEvent } from '../chainOfThoughtProcessor';

export interface Agent {
  id: string;
  type: AgentType;
  capabilities: string[];
  execute(prompt: string, context: AgentContext): Promise<AgentResponse>;
}

export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  ANALYZER = 'analyzer',
  PLANNER = 'planner',
  EXECUTOR = 'executor',
  VALIDATOR = 'validator'
}

export interface AgentContext {
  userPrompt: string;
  conversationHistory: Array<{ role: string; content: string; timestamp?: string; files?: any[]; commandResult?: any; }>;
  workspaceState?: {
    workingDirectory?: string;
    availableTools?: string[];
    currentSession?: any;
  };
  executionPlan?: ExecutionPlan;
  onProgress?: (event: CoTProgressEvent) => void;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  agentId: string;
  agentType: AgentType;
  success: boolean;
  result: any;
  thoughts?: string;
  nextActions?: string[];
  metadata?: Record<string, any>;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  userIntent: string;
  complexity: 'simple' | 'medium' | 'complex';
  steps: PlanStep[];
  currentStep: number;
  status: 'created' | 'active' | 'completed' | 'failed' | 'paused';
  createdAt: number;
  updatedAt: number;
  // Optional: team composition for complex tasks
  team?: TeamComposition;
}

export interface PlanStep {
  id: string;
  stepNumber: number;
  description: string;
  agentType: AgentType;
  requiredCapabilities: string[];
  inputs: any;
  outputs?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  // Optional: assignment to a role from the team composition
  assigneeRole?: string;
  // Optional: dependencies by step number
  dependencies?: number[];
}

// Team planning types for complex tasks
export interface TeamComposition {
  goal: string;
  domain:
    | 'app_development'
    | 'web_app'
    | 'mobile_app'
    | 'data_engineering'
    | 'data_science'
    | 'devops'
    | 'ai_agent'
    | 'documentation'
    | 'research'
    | 'generic';
  leadRole: string;
  reviewerRole: string;
  roles: TeamRole[];
  orgChart?: Array<{ role: string; reportsTo?: string }>; // simple org chart
}

export interface TeamRole {
  role: string;
  description: string;
  responsibilities: string[];
  successCriteria?: string[];
  suggestedTools?: string[];
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification';
  payload: any;
  timestamp: number;
  correlationId?: string;
}

export interface LLMRequest {
  messages: Array<{ role: string; content: string; }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  success: boolean;
  data?: {
    message: string;
    model: string;
    usage: any;
  };
  error?: string;
}

// Legacy compatibility types
export interface ChainOfThoughtResult {
  success: boolean;
  reasoning: string;
  steps: any[];
  final_response: string;
  needs_user_path?: boolean;
  path_request?: {
    access?: "read" | "write" | "read_write";
    prompt?: string;
  };
  commands_to_execute?: Array<{
    command: string;
    args: string[];
    working_dir?: string;
    explanation: string;
  }>;
  error?: string;
}
