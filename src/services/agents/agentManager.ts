import { AgentRegistry } from './agentRegistry';
import { OrchestrationAgent } from './orchestrationAgent';
import { AnalyzerAgent } from './analyzerAgent';
import { PlannerAgent } from './plannerAgent';
import { ExecutorAgent } from './executorAgent';
import { AgentType, AgentContext, AgentResponse } from './types';
import { CoTProgressEvent } from '../chainOfThoughtProcessor';

export class AgentManager {
  private registry: AgentRegistry;
  private orchestrator: OrchestrationAgent;
  private initialized = false;

  constructor() {
    this.registry = new AgentRegistry();
    this.orchestrator = new OrchestrationAgent(this.registry);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[AgentManager] Already initialized');
      return;
    }

    console.log('[AgentManager] Initializing agent system...');

    try {
      // Register all agents
      this.registry.registerAgent(this.orchestrator);
      this.registry.registerAgent(new AnalyzerAgent());
      this.registry.registerAgent(new PlannerAgent());
      this.registry.registerAgent(new ExecutorAgent());

      // Set up event listeners
      this.setupEventListeners();

      // Perform health checks
      await this.performHealthChecks();

      this.initialized = true;
      console.log('[AgentManager] Agent system initialized successfully');
    } catch (error) {
      console.error('[AgentManager] Initialization failed:', error);
      throw new Error(`Agent system initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private setupEventListeners(): void {
    this.registry.onAgentRegistered((data) => {
      console.log(`[AgentManager] Agent registered: ${data.type} (${data.id})`);
    });

    this.registry.onAgentExecuting((data) => {
      console.log(`[AgentManager] Agent executing: ${data.agentType}`);
    });

    this.registry.onAgentCompleted((data) => {
      console.log(`[AgentManager] Agent completed: ${data.agentType} (success: ${data.success})`);
    });

    this.registry.onAgentError((data) => {
      console.error(`[AgentManager] Agent error: ${data.agentType} - ${data.error}`);
    });
  }

  private async performHealthChecks(): Promise<void> {
    console.log('[AgentManager] Performing health checks...');
    
    const agents = this.registry.listAgents();
    const healthPromises = agents.map(async (agentInfo) => {
      try {
        const agent = this.registry.getAgent(agentInfo.type);
        if (agent && 'healthCheck' in agent && typeof agent.healthCheck === 'function') {
          const health = await (agent as any).healthCheck();
          console.log(`[AgentManager] Health check - ${agentInfo.type}: ${health.healthy ? 'OK' : 'FAILED'}`);
          return health;
        }
        return { healthy: true, details: { agentType: agentInfo.type, note: 'No health check implemented' } };
      } catch (error) {
        console.warn(`[AgentManager] Health check failed for ${agentInfo.type}:`, error);
        return { healthy: false, details: { agentType: agentInfo.type, error: error instanceof Error ? error.message : 'Unknown error' } };
      }
    });

    const healthResults = await Promise.all(healthPromises);
    const unhealthyAgents = healthResults.filter(result => !result.healthy);
    
    if (unhealthyAgents.length > 0) {
      console.warn('[AgentManager] Some agents failed health checks:', unhealthyAgents);
    }
  }

  async processUserInput(
    userPrompt: string,
    conversationHistory: Array<{ role: string; content: string; timestamp?: string; files?: any[]; commandResult?: any; }>,
    workspaceState?: {
      workingDirectory?: string;
      availableTools?: string[];
      currentSession?: any;
    },
    onProgress?: (event: CoTProgressEvent) => void
  ): Promise<AgentResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`[AgentManager] Processing user input: "${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);

    const context: AgentContext = {
      userPrompt,
      conversationHistory,
      workspaceState: workspaceState || {},
      onProgress,
      metadata: {
        startTime: Date.now(),
        sessionId: workspaceState?.currentSession?.id || 'unknown'
      }
    };

    try {
      const response = await this.orchestrator.execute(userPrompt, context);
      
      console.log(`[AgentManager] Processing ${response.success ? 'completed' : 'failed'}`);
      return response;
    } catch (error) {
      console.error('[AgentManager] Processing failed:', error);
      
      // Return error response in expected format
      return {
        agentId: 'agent-manager',
        agentType: AgentType.ORCHESTRATOR,
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        thoughts: 'Agent system encountered an error during processing'
      };
    }
  }

  // Agent management methods
  async restartAgent(agentType: AgentType): Promise<boolean> {
    try {
      console.log(`[AgentManager] Restarting agent: ${agentType}`);
      
      // Unregister existing agent
      this.registry.unregisterAgent(agentType);
      
      // Create and register new instance
      let newAgent;
      switch (agentType) {
        case AgentType.ANALYZER:
          newAgent = new AnalyzerAgent();
          break;
        case AgentType.PLANNER:
          newAgent = new PlannerAgent();
          break;
        case AgentType.EXECUTOR:
          newAgent = new ExecutorAgent();
          break;
        case AgentType.ORCHESTRATOR:
          // Don't restart orchestrator as it maintains state
          console.warn('[AgentManager] Orchestrator restart not supported');
          return false;
        default:
          console.error(`[AgentManager] Unknown agent type: ${agentType}`);
          return false;
      }
      
      this.registry.registerAgent(newAgent);
      console.log(`[AgentManager] Agent restarted successfully: ${agentType}`);
      return true;
    } catch (error) {
      console.error(`[AgentManager] Failed to restart agent ${agentType}:`, error);
      return false;
    }
  }

  getSystemStatus(): {
    initialized: boolean;
    registeredAgents: Array<{ type: AgentType; id: string; capabilities: string[]; }>;
    activeAgents: Array<{ type: AgentType; id: string; capabilities: string[]; }>;
    activePlans: any[];
    registryHealth: any;
  } {
    const agents = this.registry.listAgents();
    return {
      initialized: this.initialized,
      registeredAgents: agents,
      activeAgents: agents, // For simplicity, assume all registered agents are active
      activePlans: this.orchestrator.getActivePlans(),
      registryHealth: this.registry.getRegistryStatus()
    };
  }

  async shutdown(): Promise<void> {
    console.log('[AgentManager] Shutting down agent system...');
    
    try {
      // Clear any active plans
      this.orchestrator.clearCompletedPlans();
      
      // Destroy registry
      this.registry.destroy();
      
      this.initialized = false;
      console.log('[AgentManager] Agent system shutdown complete');
    } catch (error) {
      console.error('[AgentManager] Shutdown error:', error);
      throw error;
    }
  }

  // Debug and monitoring methods
  getAgentMetrics(): {
    totalAgents: number;
    agentTypes: AgentType[];
    activePlans: any[];
    systemHealth: boolean;
  } {
    const status = this.getSystemStatus();
    return {
      totalAgents: status.agents.length,
      agentTypes: status.agents.map(a => a.type),
      activePlans: this.orchestrator.getActivePlans(),
      systemHealth: this.initialized && status.registryHealth.isHealthy
    };
  }

  async getSystemHealth(): Promise<{
    healthy: boolean;
    details: {
      agentCount: number;
      orchestrationAgent: { healthy: boolean; error?: string };
      registry: any;
    };
  }> {
    try {
      const orchestrationHealth = await this.orchestrator.healthCheck();
      const registryStatus = this.registry.getRegistryStatus();
      const agentList = this.registry.listAgents();
      
      return {
        healthy: orchestrationHealth.healthy && registryStatus.isHealthy,
        details: {
          agentCount: agentList.length,
          orchestrationAgent: orchestrationHealth,
          registry: registryStatus
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          agentCount: 0,
          orchestrationAgent: { 
            healthy: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          registry: { isHealthy: false }
        }
      };
    }
  }

  // Plan management
  async resumePlan(planId: string, context: AgentContext): Promise<AgentResponse> {
    if (!this.initialized) {
      throw new Error('Agent system not initialized');
    }
    
    return this.orchestrator.resumePlan(planId, context);
  }

  getPlan(planId: string) {
    return this.orchestrator.getPlan(planId);
  }

  getActivePlans() {
    return this.orchestrator.getActivePlans();
  }
}

// Singleton instance
let agentManagerInstance: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager();
  }
  return agentManagerInstance;
}