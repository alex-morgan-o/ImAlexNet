# Natural Language Command Analysis Feature

## Overview

This feature enables AlexNet to analyze natural language user messages and determine if they require shell command execution. When a command is detected, the system asks for user permission before executing it, ensuring security and user control.

## Architecture

### Components Added

1. **CommandPermissionDialog.vue** - Modal dialog for command execution approval
2. **commandAnalyzer.ts** - Service for AI-powered command analysis  
3. **commands.ts** - Shared TypeScript interfaces
4. **Modified ChatMessage.vue** - Integrated command analysis and execution flow

### Flow Diagram

```
User Message → AI Analysis → Permission Dialog → Command Execution → Result Display
     ↓              ↓              ↓                 ↓                ↓
"list files"   → needsCommand:true → User approves → ls -la executed → Output shown
```

## Implementation Details

### 1. AI-Powered Analysis (`commandAnalyzer.ts`)

- Uses Cerebras AI to analyze natural language messages
- Supports caching for performance (5-minute cache expiry)
- Returns structured analysis with command, arguments, and confidence score
- Handles only safe, whitelisted commands

**Supported Commands:**
- `ls` - List directory contents
- `cat` - Display file contents  
- `mkdir` - Create directories
- `rm` - Remove files
- `mv` - Move/rename files
- `cp` - Copy files
- `touch` - Create empty files
- `echo` - Output text (via sh -c for file writing)
- `head/tail` - Show file portions
- `wc` - Word count
- `find` - Find files
- `grep` - Search in files
- `sh` - Shell commands (limited to echo redirection)

### 2. Permission Dialog (`CommandPermissionDialog.vue`)

**Features:**
- Shows user's original message
- Displays AI analysis explanation
- Shows exact command to be executed
- Confidence indicator with color coding
- Security notice about safe directory restrictions
- Approve/Cancel buttons
- ESC key support for closing

**Security Indicators:**
- 🟢 High confidence (80%+)
- 🟡 Medium confidence (60-80%)
- 🔴 Low confidence (<60%)

### 3. Modified Chat Experience (`ChatMessage.vue`)

**New UI States:**
1. **Analyzing** - "Analyzing message for commands..." with spinner
2. **Command Detected** - Shows analysis with Execute/Dismiss buttons  
3. **Executing** - "Executing command..." with spinner
4. **Results** - Command output with success/error indicators

**Auto-Analysis:** 
- Automatically analyzes user messages when first displayed
- Only shows command options for high-confidence detections (70%+)
- Caches analysis results for performance

## Usage Examples

### Natural Language Input → Shell Commands

| User Input | Detected Command | Explanation |
|------------|------------------|-------------|
| "list all files" | `ls -la` | List all files including hidden ones |
| "show contents of package.json" | `cat package.json` | Display file contents |
| "create directory called test" | `mkdir test` | Create new directory |
| "write hello to greeting.txt" | `sh -c "echo 'hello' > greeting.txt"` | Write text to file |
| "delete old-data.txt" | `rm old-data.txt` | Remove specified file |
| "copy README.md to backup.md" | `cp README.md backup.md` | Copy file to new location |

### Non-Command Examples

| User Input | Result | Explanation |
|------------|--------|-------------|
| "What's the weather?" | No command | General question, no shell action needed |
| "How do I learn coding?" | No command | Conversational query |
| "Tell me about AI" | No command | Information request |

## Security Features

### Command Validation
- Whitelist of allowed commands only
- Path safety checks (blocks system directories)
- Argument sanitization (no shell injection characters)
- Working directory restrictions (user directories only)

### User Control
- Explicit permission required for all command execution
- Clear command preview before execution
- Ability to dismiss command suggestions
- No automatic execution without approval

### Safe Directories
Commands execute only in safe directories:
- User home directory
- Documents folder  
- Downloads folder
- Desktop folder
- Custom .alexnet directory

**Blocked System Paths:**
- `/System`, `/usr`, `/bin`, `/etc` (macOS/Linux)
- `C:\Windows`, `C:\Program Files` (Windows)
- Hidden system files (except .alexnet)

## Testing

### Manual Testing
1. Start AlexNet desktop application
2. Type natural language commands in chat
3. Verify AI analysis appears for command-like messages
4. Test permission dialog functionality
5. Confirm command execution and output display

### Automated Testing
```bash
# Test command analysis (requires .env with CEREBRAS_API_KEY)
node scripts/test-command-analysis.js
```

## Configuration

### Environment Variables
```bash
CEREBRAS_API_KEY=your_api_key_here
```

### AI Model Settings
- Model: `llama3.1-8b` 
- Temperature: `0.1` (low for consistent structured output)
- Max Tokens: `300`
- Confidence Threshold: `0.7` (70% minimum to show command options)

## Error Handling

### AI Analysis Failures
- Graceful fallback to normal chat mode
- Error logging for debugging
- Cache prevents repeated failed requests

### Command Execution Failures  
- Error output displayed in chat
- Exit codes and stderr captured
- No system state corruption

### Network Issues
- Timeout handling for AI requests
- Offline mode graceful degradation
- Retry logic for transient failures

## Performance Optimizations

### Caching Strategy
- 5-minute cache for analysis results
- Prevents duplicate AI requests for similar messages
- Automatic cache cleanup for expired entries

### UI Responsiveness
- Non-blocking analysis (async)
- Loading indicators during processing
- Smooth animations for state transitions

## Future Enhancements

### Potential Improvements
1. **Command History** - Remember frequently used commands
2. **Smart Suggestions** - Suggest related commands based on context
3. **Batch Operations** - Support multiple commands in one message
4. **Custom Commands** - User-defined command shortcuts
5. **Output Formatting** - Syntax highlighting for code output
6. **File Preview** - Inline preview for text files
7. **Directory Navigation** - Remember and suggest previous directories

### Model Improvements
- Fine-tuned model specifically for shell command detection
- Support for more complex command compositions
- Better understanding of file system context

## Troubleshooting

### Common Issues

**Analysis not working:**
- Check CEREBRAS_API_KEY in .env file
- Verify internet connection
- Check browser console for errors

**Commands not detected:**
- Try more explicit language ("list files" vs "show me stuff")
- Use present tense ("create directory" vs "I want to create")
- Be specific about file names and paths

**Permission dialog not showing:**
- Check confidence score (must be >70%)
- Verify command is in whitelist
- Look for JavaScript errors in console

**Command execution failing:**
- Check file permissions
- Verify paths exist and are accessible
- Ensure working directory is safe

### Debug Information

Enable debug logging in browser console:
```javascript
localStorage.setItem('alexnet-debug', 'true');
```

View command analysis cache:
```javascript
// In browser console
import { CommandAnalyzerService } from './src/services/commandAnalyzer';
CommandAnalyzerService.getCacheStats();
```

## Code Structure

```
src/
├── components/
│   ├── ChatMessage.vue (modified)
│   └── CommandPermissionDialog.vue (new)
├── services/
│   └── commandAnalyzer.ts (new)
├── types/
│   └── commands.ts (new)
└── views/
    └── ChatView.vue (handles command execution events)

scripts/
└── test-command-analysis.js (testing utility)
```

## Integration Notes

This feature integrates with existing AlexNet systems:

- **Session Management** - Command results saved to chat sessions
- **Cerebras AI** - Uses existing AI service for analysis  
- **Security** - Leverages existing Tauri command validation
- **UI Theme** - Follows One Dark Pro color scheme
- **TypeScript** - Full type safety throughout

The implementation maintains backward compatibility and doesn't break existing chat functionality.