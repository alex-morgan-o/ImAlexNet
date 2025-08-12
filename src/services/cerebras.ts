import { invoke } from '@tauri-apps/api/core'

export interface CerebrasResponse {
  success: boolean
  data?: {
    message?: string
    text?: string
    model?: string
    usage?: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
    stream?: boolean
    chunks?: Array<{ content: string; created: number }>
  }
  error?: string
  details?: any
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  stream?: boolean
}

export interface ChatOptions extends CompletionOptions {
  messages: ChatMessage[]
}

export class CerebrasService {
  static async completion(prompt: string, options: CompletionOptions = {}): Promise<CerebrasResponse> {
    try {
      const response = await invoke<CerebrasResponse>('cerebras_completion', {
        prompt,
        model: options.model || 'llama3.1-8b',
        maxTokens: options.max_tokens || 100,
        temperature: options.temperature || 0.7,
        stream: options.stream || false
      })
      return response
    } catch (error) {
      console.error('Cerebras completion error:', error)
      return {
        success: false,
        error: error as string
      }
    }
  }

  static async chat(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CerebrasResponse> {
    try {
      const response = await invoke<CerebrasResponse>('cerebras_chat', {
        messages,
        model: options.model || 'llama3.1-8b',
        maxTokens: options.max_tokens || 100,
        temperature: options.temperature || 0.7,
        stream: options.stream || false
      })
      return response
    } catch (error) {
      console.error('Cerebras chat error:', error)
      return {
        success: false,
        error: error as string
      }
    }
  }

  static async getModels(): Promise<CerebrasResponse> {
    try {
      const response = await invoke<CerebrasResponse>('cerebras_models')
      return response
    } catch (error) {
      console.error('Cerebras models error:', error)
      return {
        success: false,
        error: error as string
      }
    }
  }

  // Helper method to convert app messages to Cerebras format
  static formatMessages(messages: Array<{ role: 'user' | 'assistant'; content?: string }>): ChatMessage[] {
    return messages
      .filter(msg => msg.content && msg.content.trim())
      .map(msg => ({
        role: msg.role,
        content: msg.content!.trim()
      }))
  }
}

// Available models (based on documentation)
export const CEREBRAS_MODELS = [
  'llama3.1-8b',
  'llama-3.3-70b',
  'llama-4-scout-17b-16e-instruct',
  'llama-4-maverick-17b-128e-instruct',
  'qwen2.5-7b-instruct',
  'qwen2.5-14b-instruct',
  'qwen2.5-32b-instruct',
  'qwen2.5-72b-instruct',
  'gpt-oss-120b',
  'deepseek-r1-distill-llama-70b'
] as const

export type CerebrasModel = typeof CEREBRAS_MODELS[number]