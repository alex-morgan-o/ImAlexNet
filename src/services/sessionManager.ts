import { invoke } from '@tauri-apps/api/core'

// Types matching Rust backend
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content?: string
  code?: {
    language: string
    content: string
  }
  files: string[]
  timestamp: string // ISO string from backend
  can_apply?: boolean
}

export interface SessionMetadata {
  model?: string
  total_messages: number
  session_type: string
  tags: string[]
}

export interface ChatSession {
  id: string
  name: string
  created_at: string // ISO string from backend
  last_modified: string // ISO string from backend
  messages: ChatMessage[]
  metadata: SessionMetadata
}

export interface SessionListItem {
  id: string
  name: string
  created_at: string
  last_modified: string
  message_count: number
  preview?: string
}

// Frontend message interface (for compatibility with existing code)
export interface FrontendMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string
  code?: {
    language: string
    content: string
  }
  files?: File[]
  timestamp: Date
  canApply?: boolean
}

export class SessionManagerService {
  private currentSessionId: string | null = null
  
  /**
   * Get the AlexNet directory path
   */
  static async getAlexNetDirectory(): Promise<string> {
    return await invoke<string>('get_alexnet_directory')
  }
  
  /**
   * Generate a unique session ID with the specified name
   */
  static async generateSessionId(sessionName: string): Promise<string> {
    return await invoke<string>('generate_session_id', { sessionName })
  }
  
  /**
   * Create a new chat session
   */
  async createSession(sessionName: string): Promise<ChatSession> {
    const session = await invoke<ChatSession>('create_chat_session', { sessionName })
    this.currentSessionId = session.id
    return session
  }
  
  /**
   * Save a message to the current session
   */
  async saveMessage(message: FrontendMessage): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active session. Create a session first.')
    }
    
    const backendMessage: ChatMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      code: message.code,
      files: message.files?.map(f => f.name) || [], // Just store file names for now
      timestamp: message.timestamp.toISOString(),
      can_apply: message.canApply
    }
    
    await invoke<void>('save_chat_message', {
      sessionId: this.currentSessionId,
      message: backendMessage
    })
  }
  
  /**
   * Load a chat session by ID
   */
  async loadSession(sessionId: string): Promise<ChatSession> {
    const session = await invoke<ChatSession>('load_chat_session', { sessionId })
    this.currentSessionId = sessionId
    return session
  }
  
  /**
   * List all available chat sessions
   */
  static async listSessions(): Promise<SessionListItem[]> {
    return await invoke<SessionListItem[]>('list_chat_sessions')
  }
  
  /**
   * Delete a chat session
   */
  static async deleteSession(sessionId: string): Promise<void> {
    await invoke<void>('delete_chat_session', { sessionId })
  }
  
  /**
   * Update session metadata
   */
  async updateSessionMetadata(
    sessionId: string,
    updates: {
      name?: string
      tags?: string[]
      sessionType?: string
    }
  ): Promise<void> {
    await invoke<void>('update_session_metadata', {
      sessionId,
      name: updates.name,
      tags: updates.tags,
      sessionType: updates.sessionType
    })
  }
  
  /**
   * Export a session to a file
   */
  static async exportSession(sessionId: string, exportPath: string): Promise<void> {
    await invoke<void>('export_chat_session', { sessionId, exportPath })
  }
  
  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }
  
  /**
   * Set the current session ID
   */
  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId
  }
  
  /**
   * Convert backend messages to frontend format
   */
  static convertToFrontendMessages(backendMessages: ChatMessage[]): FrontendMessage[] {
    return backendMessages
      .filter(msg => msg.role !== 'system') // Filter out system messages for now
      .map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant', // Type assertion after filtering
        content: msg.content,
        code: msg.code,
        files: [], // Files not implemented in full yet
        timestamp: new Date(msg.timestamp),
        canApply: msg.can_apply
      }))
  }
  
  /**
   * Create a new session with a descriptive name based on first message
   */
  async createSessionFromMessage(firstMessage: string): Promise<ChatSession> {
    // Generate a descriptive session name from the first message
    const sessionName = this.generateSessionName(firstMessage)
    return await this.createSession(sessionName)
  }
  
  /**
   * Generate a session name from a message (first few words)
   */
  private generateSessionName(message: string): string {
    const words = message.trim().split(/\s+/).slice(0, 4)
    const baseName = words.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
    return baseName || 'chat'
  }
  
  /**
   * Auto-save a message to the current session or create a new session
   */
  async autoSaveMessage(message: FrontendMessage): Promise<void> {
    if (!this.currentSessionId) {
      // Create a new session based on the message content
      if (message.content) {
        await this.createSessionFromMessage(message.content)
      } else {
        await this.createSession('chat')
      }
    }
    
    await this.saveMessage(message)
  }
  
  /**
   * Clear current session (for new session functionality)
   */
  clearCurrentSession(): void {
    this.currentSessionId = null
  }
}

// Export singleton instance
export const sessionManager = new SessionManagerService()