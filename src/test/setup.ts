// Test setup file
import { vi } from 'vitest'

// Mock Tauri API
global.mockTauriInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: global.mockTauriInvoke
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}))

// Global test utilities
global.createMockAgent = (type: string, capabilities: string[]) => {
  return {
    id: `test-${type}-${Date.now()}`,
    type,
    capabilities,
    execute: vi.fn()
  }
}

global.createMockContext = (overrides = {}) => {
  return {
    userPrompt: 'test prompt',
    conversationHistory: [],
    workspaceState: {
      workingDirectory: '/test/workspace',
      availableTools: ['file-operations', 'command-execution'],
      currentSession: null
    },
    onProgress: vi.fn(),
    metadata: {},
    ...overrides
  }
}

global.createMockLLMResponse = (success = true, message = 'test response') => {
  if (success) {
    return {
      success: true,
      data: {
        message,
        model: 'test-model',
        usage: {}
      }
    }
  } else {
    return {
      success: false,
      error: 'Test error'
    }
  }
}

// Setup console mocking to reduce noise in tests
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn
const originalConsoleError = console.error

beforeEach(() => {
  // Mock console methods to reduce test output noise
  console.log = vi.fn()
  console.warn = vi.fn()
  console.error = vi.fn()
  
  // Reset all mocks
  vi.clearAllMocks()
})

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog
  console.warn = originalConsoleWarn
  console.error = originalConsoleError
})