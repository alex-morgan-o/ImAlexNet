// Types for AI-powered command analysis and execution

export interface AnalyzedCommand {
    needsCommand: boolean;
    command: string;
    args: string[];
    explanation: string;
    confidence: number;
}

export interface CommandAnalysisResult {
    success: boolean;
    analysis?: AnalyzedCommand;
    error?: string;
}

export interface CommandExecutionEvent {
    messageId: string;
    result: ShellCommandResult;
}

// Re-export from session manager for convenience
export interface ShellCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exit_code?: number;
}