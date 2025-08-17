#!/usr/bin/env node

/**
 * Test script for the command analysis feature
 * This script tests the natural language to shell command analysis
 * without running the full Tauri application
 */

const path = require("path");
const dotenv = require("dotenv");
const { Cerebras } = require("@cerebras/cerebras_cloud_sdk");

// Load .env file from project root
const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });

class CommandAnalyzer {
  constructor() {
    this.client = new Cerebras({
      apiKey: process.env.CEREBRAS_API_KEY,
    });
  }

  buildSystemPrompt() {
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

  async analyzeMessage(content) {
    try {
      const response = await this.client.chat.completions.create({
        messages: [
          { role: "system", content: this.buildSystemPrompt() },
          { role: "user", content: content },
        ],
        model: "llama3.1-8b",
        max_tokens: 8192,
        temperature: 0.1,
      });

      const analysisText = response.choices[0]?.message?.content?.trim();
      if (!analysisText) {
        throw new Error("No response from AI");
      }

      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return { success: true, analysis };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error,
      };
    }
  }
}

// Test cases
const testCases = [
  // Clear command cases
  "list all files in the current directory",
  "show me the contents of package.json",
  "create a new folder called test-dir",
  "delete the file old-data.txt",
  "copy README.md to README-backup.md",
  "write 'Hello World' to greeting.txt",

  // Ambiguous cases
  "what files are here?",
  "I need to see what's in config.json",
  "make a backup of important.txt",

  // Non-command cases
  "what is the weather today?",
  "how do I learn programming?",
  "tell me about artificial intelligence",
  "what's your favorite color?",
];

async function runTests() {
  const analyzer = new CommandAnalyzer();

  console.log("🧪 Testing Command Analysis Feature\n");
  console.log("=" * 60);

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${i + 1}. Testing: "${testCase}"`);
    console.log("-".repeat(50));

    const result = await analyzer.analyzeMessage(testCase);

    if (result.success) {
      const analysis = result.analysis;
      console.log(`✅ Analysis successful:`);
      console.log(`   Needs Command: ${analysis.needsCommand ? "✓" : "✗"}`);
      if (analysis.needsCommand) {
        console.log(
          `   Command: ${analysis.command} ${analysis.args.join(" ")}`,
        );
      }
      console.log(`   Explanation: ${analysis.explanation}`);
      console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);

      // Color coding based on confidence
      const confidenceEmoji =
        analysis.confidence >= 0.8
          ? "🟢"
          : analysis.confidence >= 0.6
            ? "🟡"
            : "🔴";
      console.log(`   Confidence Level: ${confidenceEmoji}`);
    } else {
      console.log(`❌ Analysis failed: ${result.error}`);
    }
  }

  console.log("\n" + "=" * 60);
  console.log("🎉 Test run completed!");
  console.log("\nNext steps:");
  console.log("- Test the feature in the AlexNet desktop app");
  console.log("- Try natural language commands in the chat interface");
  console.log("- Verify permission dialogs appear for command execution");
}

// Run tests if script is called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = CommandAnalyzer;
