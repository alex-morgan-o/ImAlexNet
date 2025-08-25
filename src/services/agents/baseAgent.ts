import { invoke } from "@tauri-apps/api/core";
import { Agent, AgentType, AgentContext, AgentResponse, LLMRequest, LLMResponse } from './types';
import { CoTProgressEvent } from '../chainOfThoughtProcessor';

export abstract class BaseAgent implements Agent {
  public readonly id: string;
  public readonly type: AgentType;
  public readonly capabilities: string[];

  protected constructor(type: AgentType, capabilities: string[], id?: string) {
    this.type = type;
    this.capabilities = capabilities;
    this.id = id || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  abstract execute(prompt: string, context: AgentContext): Promise<AgentResponse>;

  // Low-level LLM call (no progress logging)
  protected async callLLM(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await invoke<LLMResponse>("cerebras_chat", {
        messages: request.messages,
        model: request.model || "qwen-3-coder-480b",
        max_tokens: request.max_tokens || 65536,
        temperature: request.temperature || 0.3,
        stream: request.stream || false,
      });

      return response;
    } catch (error) {
      console.error(`[${this.type}] LLM call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown LLM error'
      };
    }
  }

  // High-level LLM call with detailed onProgress logging into the UI
  protected async llm(
    request: LLMRequest,
    context: AgentContext,
    opts: { label?: string; truncate?: number } = {}
  ): Promise<LLMResponse> {
    const { label = 'LLM', truncate = 2000 } = opts;

    const safe = (s: string) => this.sanitizeJsonLike(String(s || ''));
    const truncateText = (s: string) => (s.length > truncate ? s.slice(0, truncate) + `\n… [truncated ${s.length - truncate} chars]` : s);
    const messagesPreview = (request.messages || [])
      .map(m => `${m.role.toUpperCase()}:\n${safe(m.content)}`)
      .join('\n\n');

    this.emitProgress({
      phase: 'log',
      text: `📤 [${this.type}] ${label} request → model=${request.model || 'qwen-3-coder-480b'}, temp=${request.temperature ?? 0.3}, max_tokens=${request.max_tokens ?? 65536}`
    }, context);
    this.emitProgress({
      phase: 'log',
      text: `📝 [${this.type}] Prompt:\n${truncateText(messagesPreview)}`
    }, context);

    const started = Date.now();
    const resp = await this.callLLM(request);
    const duration = Date.now() - started;

    if (resp.success && resp.data?.message) {
      this.emitProgress({
        phase: 'log',
        text: `📥 [${this.type}] Response (${duration}ms):\n${truncateText(safe(resp.data.message))}`
      }, context);
    } else {
      this.emitProgress({
        phase: 'log',
        text: `⚠️ [${this.type}] LLM error (${duration}ms): ${resp.error || 'Unknown error'}`
      }, context);
    }

    return resp;
  }

  protected emitProgress(event: CoTProgressEvent, context: AgentContext): void {
    if (context.onProgress) {
      try {
        context.onProgress(event);
      } catch (error) {
        console.error(`[${this.type}] Error emitting progress:`, error);
      }
    }
  }

  protected logThought(thought: string): void {
    console.log(`[${this.type}] ${thought}`);
  }

  protected createSuccessResponse(result: any, thoughts?: string, nextActions?: string[]): AgentResponse {
    return {
      agentId: this.id,
      agentType: this.type,
      success: true,
      result,
      thoughts,
      nextActions,
      metadata: {
        executedAt: Date.now(),
        capabilities: this.capabilities
      }
    };
  }

  protected createErrorResponse(error: string, thoughts?: string): AgentResponse {
    return {
      agentId: this.id,
      agentType: this.type,
      success: false,
      result: null,
      error,
      thoughts,
      metadata: {
        executedAt: Date.now(),
        capabilities: this.capabilities
      }
    };
  }

  protected sanitizeJsonLike(input: string): string {
    let s = input.trim();
    // Strip common Markdown code fences
    if (s.startsWith("```")) {
      s = s.replace(/^```[a-zA-Z0-9_-]*\n/, "").replace(/```\s*$/, "");
    }
    // Remove ANSI escape sequences
    const ANSI_REGEX =
      /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;
    s = s.replace(ANSI_REGEX, "");
    // Remove other non-printable control chars (except tab/newline/carriage return)
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    return s.trim();
  }

  protected maybeUnwrapQuotedJson(input: string): string {
    const t = input.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      try {
        const unwrapped = JSON.parse(t);
        if (typeof unwrapped === "string" && /\{\s*\"/.test(unwrapped)) {
          return unwrapped;
        }
      } catch (_) {
        // If parsing fails, return original
      }
    }
    return input;
  }

  protected parseJsonResponse(jsonString: string): any {
    // Clean and normalize the JSON string
    let cleaned = this.sanitizeJsonLike(jsonString);
    cleaned = this.maybeUnwrapQuotedJson(cleaned);
    
    try {
      // Try direct parsing first
      return JSON.parse(cleaned);
    } catch (error) {
      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (extractError) {
          throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      throw new Error(`No valid JSON found in response: ${jsonString.substring(0, 200)}...`);
    }
  }

  protected buildContextSummary(context: AgentContext): string {
    const recentHistory = context.conversationHistory.slice(-3);
    return recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

  protected getWorkspaceInfo(context: AgentContext): string {
    const workspace = context.workspaceState;
    if (!workspace) return 'No workspace information available.';
    
    const parts = [];
    if (workspace.workingDirectory) {
      parts.push(`Working Directory: ${workspace.workingDirectory}`);
    }
    if (workspace.availableTools && workspace.availableTools.length > 0) {
      parts.push(`Available Tools: ${workspace.availableTools.join(', ')}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : 'No workspace information available.';
  }

  // Health check method
  async healthCheck(): Promise<{ healthy: boolean; details: any; }> {
    try {
      // Test LLM connectivity with a simple request
      const testResponse = await this.callLLM({
        messages: [{ role: 'user', content: 'ping' }],
        temperature: 0,
        max_tokens: 10
      });

      if (testResponse.success) {
        return {
          healthy: true,
          details: {
            agentId: this.id,
            agentType: this.type,
            capabilities: this.capabilities,
            llmConnectivity: true,
            lastChecked: new Date().toISOString()
          }
        };
      } else {
        return {
          healthy: false,
          details: {
            agentId: this.id,
            agentType: this.type,
            error: testResponse.error || 'LLM call failed',
            llmConnectivity: false,
            lastChecked: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      return {
        healthy: false,
        details: {
          agentId: this.id,
          agentType: this.type,
          error: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date().toISOString()
        }
      };
    }
  }
}
