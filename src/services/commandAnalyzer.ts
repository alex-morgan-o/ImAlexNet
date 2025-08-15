import { CerebrasService } from "./cerebras";
import type { AnalyzedCommand, CommandAnalysisResult } from "../types/commands";

/**
 * Service for analyzing natural language messages to determine if they require shell command execution
 * Uses Cerebras AI to provide intelligent command translation and analysis
 */
export class CommandAnalyzerService {
  private static analysisCache = new Map<string, AnalyzedCommand>();
  private static readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  private static cacheTimestamps = new Map<string, number>();

  /**
   * Analyzes a user message to determine if it requires shell command execution
   * @param content - The user's natural language message
   * @returns Analysis result with command details if needed
   */
  static async analyzeMessage(content: string): Promise<CommandAnalysisResult> {
    if (!content?.trim()) {
      return { success: false, error: "Empty message" };
    }

    const normalizedContent = content.trim().toLowerCase();

    // Check cache first
    if (this.analysisCache.has(normalizedContent)) {
      const timestamp = this.cacheTimestamps.get(normalizedContent) || 0;
      if (Date.now() - timestamp < this.CACHE_EXPIRY) {
        return {
          success: true,
          analysis: this.analysisCache.get(normalizedContent)!,
        };
      } else {
        // Remove expired entry
        this.analysisCache.delete(normalizedContent);
        this.cacheTimestamps.delete(normalizedContent);
      }
    }

    const systemPrompt = this.buildSystemPrompt();

    try {
      const response = await CerebrasService.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: content },
        ],
        {
          model: "llama3.1-8b",
          max_tokens: 2024,
          temperature: 0.1, // Low temperature for consistent structured output
        },
      );

      if (!response.success || !response.data?.message) {
        return {
          success: false,
          error: `AI analysis failed: ${response.error || "No response"}`,
        };
      }

      const analysis = this.parseAnalysisResponse(response.data.message);

      if (!analysis) {
        return {
          success: false,
          error: "Failed to parse AI response",
        };
      }

      // Validate the analysis
      const validationError = this.validateAnalysis(analysis);
      if (validationError) {
        return {
          success: false,
          error: validationError,
        };
      }

      // Cache successful analysis
      this.analysisCache.set(normalizedContent, analysis);
      this.cacheTimestamps.set(normalizedContent, Date.now());

      return {
        success: true,
        analysis,
      };
    } catch (error) {
      console.error("Error analyzing message for commands:", error);
      return {
        success: false,
        error: `Analysis error: ${error}`,
      };
    }
  }

  /**
   * Builds the system prompt for command analysis
   */
  private static buildSystemPrompt(): string {
    return `You are a shell command analyzer for AlexNet. Analyze user messages to determine if they require executing shell commands.

IMPORTANT: Return ONLY a valid JSON response with this exact structure:
{
    "needsCommand": true/false,
    "command": "command_name",
    "args": ["arg1", "arg2"],
    "explanation": "Brief explanation",
    "confidence": 0.0-1.0
}

SUPPORTED COMMANDS: ls, cat, mkdir, rm, mv, cp, touch, echo, head, tail, wc, find, grep, sh

COMMAND PATTERNS:
- "list files" → {"needsCommand": true, "command": "ls", "args": ["-la"], "explanation": "List all files including hidden ones", "confidence": 0.9}
- "show contents of file.txt" → {"needsCommand": true, "command": "cat", "args": ["file.txt"], "explanation": "Display contents of file.txt", "confidence": 0.95}
- "create directory named test" → {"needsCommand": true, "command": "mkdir", "args": ["test"], "explanation": "Create directory 'test'", "confidence": 0.9}
- "write hello to file.txt" → {"needsCommand": true, "command": "sh", "args": ["-c", "echo 'hello' > file.txt"], "explanation": "Write 'hello' to file.txt", "confidence": 0.9}
- "delete file.txt" → {"needsCommand": true, "command": "rm", "args": ["file.txt"], "explanation": "Delete file.txt", "confidence": 0.9}
- "copy file1.txt to file2.txt" → {"needsCommand": true, "command": "cp", "args": ["file1.txt", "file2.txt"], "explanation": "Copy file1.txt to file2.txt", "confidence": 0.9}
- "what's the weather?" → {"needsCommand": false, "explanation": "General question, no command needed", "confidence": 0.9}

RULES:
- Only suggest commands from the supported list
- Use high confidence (0.8+) for clear command requests
- Use medium confidence (0.6-0.8) for ambiguous requests
- Use low confidence (<0.6) when uncertain
- For file writing, use 'sh -c "echo '...' > filename"' format
- Be conservative - if unsure, set needsCommand to false

Return only valid JSON, no other text.`;
  }

  /**
   * Parses the AI response to extract command analysis
   */
  private static parseAnalysisResponse(
    response: string,
  ): AnalyzedCommand | null {
    try {
      // Clean the response and extract JSON
      const cleaned = response.trim();

      // Try to find JSON in the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in AI response:", response);
        return null;
      }

      const analysis = JSON.parse(jsonMatch[0]) as AnalyzedCommand;

      return analysis;
    } catch (error) {
      console.error(
        "Failed to parse AI response:",
        error,
        "Response:",
        response,
      );
      return null;
    }
  }

  /**
   * Validates the analysis result structure and content
   */
  private static validateAnalysis(analysis: any): string | null {
    if (typeof analysis.needsCommand !== "boolean") {
      return "Invalid needsCommand field";
    }

    if (typeof analysis.explanation !== "string") {
      return "Invalid explanation field";
    }

    if (
      typeof analysis.confidence !== "number" ||
      analysis.confidence < 0 ||
      analysis.confidence > 1
    ) {
      return "Invalid confidence field";
    }

    if (analysis.needsCommand) {
      if (!analysis.command || typeof analysis.command !== "string") {
        return "Missing or invalid command field";
      }

      if (!Array.isArray(analysis.args)) {
        return "Missing or invalid args field";
      }

      // Validate command is in allowed list
      const allowedCommands = [
        "ls",
        "cat",
        "mkdir",
        "rm",
        "mv",
        "cp",
        "touch",
        "echo",
        "head",
        "tail",
        "wc",
        "find",
        "grep",
        "sh",
      ];
      if (!allowedCommands.includes(analysis.command)) {
        return `Command '${analysis.command}' is not allowed`;
      }
    }

    return null; // Valid
  }

  /**
   * Clears the analysis cache
   */
  static clearCache(): void {
    this.analysisCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Gets cache statistics
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.analysisCache.size,
      entries: Array.from(this.analysisCache.keys()),
    };
  }
}
