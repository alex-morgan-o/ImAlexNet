import { Agent, AgentType, AgentContext, AgentResponse, AgentMessage } from './types';

// Simple EventEmitter replacement for browser compatibility
class SimpleEventBus {
  private listeners = new Map<string, Array<(data: any) => void>>();

  on(event: string, handler: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

export class AgentRegistry {
  private agents = new Map<AgentType, Agent>();
  private eventBus = new SimpleEventBus();
  private messageHandlers = new Map<string, Array<(message: AgentMessage) => void>>();

  constructor() {
    // No setup needed for simple event bus
  }

  registerAgent(agent: Agent): void {
    console.log(`[AgentRegistry] Registering agent: ${agent.type} (${agent.id})`);
    this.agents.set(agent.type, agent);
    this.eventBus.emit('agent:registered', { 
      type: agent.type, 
      id: agent.id, 
      capabilities: agent.capabilities 
    });
  }

  unregisterAgent(agentType: AgentType): void {
    const agent = this.agents.get(agentType);
    if (agent) {
      this.agents.delete(agentType);
      this.eventBus.emit('agent:unregistered', { type: agentType, id: agent.id });
      console.log(`[AgentRegistry] Unregistered agent: ${agentType} (${agent.id})`);
    }
  }

  getAgent(type: AgentType): Agent | null {
    return this.agents.get(type) || null;
  }

  hasAgent(type: AgentType): boolean {
    return this.agents.has(type);
  }

  listAgents(): Array<{ type: AgentType; id: string; capabilities: string[]; }> {
    return Array.from(this.agents.values()).map(agent => ({
      type: agent.type,
      id: agent.id,
      capabilities: agent.capabilities
    }));
  }

  async executeWithAgent(
    agentType: AgentType,
    input: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    const agent = this.getAgent(agentType);
    if (!agent) {
      throw new Error(`Agent of type ${agentType} not found`);
    }

    console.log(`[AgentRegistry] Executing with agent: ${agentType}`);
    this.eventBus.emit('agent:executing', { 
      agentType, 
      agentId: agent.id, 
      input: input.substring(0, 100) + (input.length > 100 ? '...' : '')
    });

    try {
      const response = await agent.execute(input, context);
      
      this.eventBus.emit('agent:completed', { 
        agentType, 
        agentId: agent.id, 
        success: response.success,
        hasResult: !!response.result
      });
      
      return response;
    } catch (error) {
      const errorResponse: AgentResponse = {
        agentId: agent.id,
        agentType: agent.type,
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        thoughts: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };

      this.eventBus.emit('agent:error', {
        agentType,
        agentId: agent.id,
        error: errorResponse.error
      });

      return errorResponse;
    }
  }

  // Message bus functionality
  subscribe(agentId: string, handler: (message: AgentMessage) => void): void {
    if (!this.messageHandlers.has(agentId)) {
      this.messageHandlers.set(agentId, []);
    }
    this.messageHandlers.get(agentId)!.push(handler);
    console.log(`[AgentRegistry] Agent ${agentId} subscribed to messages`);
  }

  unsubscribe(agentId: string): void {
    this.messageHandlers.delete(agentId);
    console.log(`[AgentRegistry] Agent ${agentId} unsubscribed from messages`);
  }

  publishMessage(message: AgentMessage): void {
    const handlers = this.messageHandlers.get(message.to);
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`[AgentRegistry] Error handling message for ${message.to}:`, error);
        }
      });
    } else {
      console.warn(`[AgentRegistry] No handlers found for agent: ${message.to}`);
    }
  }

  // Event subscription for external listeners
  onAgentRegistered(callback: (data: any) => void): void {
    this.eventBus.on('agent:registered', callback);
  }

  onAgentExecuting(callback: (data: any) => void): void {
    this.eventBus.on('agent:executing', callback);
  }

  onAgentCompleted(callback: (data: any) => void): void {
    this.eventBus.on('agent:completed', callback);
  }

  onAgentError(callback: (data: any) => void): void {
    this.eventBus.on('agent:error', callback);
  }

  // Health check
  getRegistryStatus(): { totalAgents: number; agentTypes: AgentType[]; isHealthy: boolean; } {
    return {
      totalAgents: this.agents.size,
      agentTypes: Array.from(this.agents.keys()),
      isHealthy: this.agents.size > 0
    };
  }

  // Cleanup
  destroy(): void {
    this.agents.clear();
    this.messageHandlers.clear();
    this.eventBus.removeAllListeners();
    console.log('[AgentRegistry] Registry destroyed and cleaned up');
  }
}