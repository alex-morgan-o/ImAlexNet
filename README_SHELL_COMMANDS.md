# Shell Command Integration

AlexNet now supports executing shell commands directly from chat messages. This feature enhances the AI assistant's capability to interact with the file system and perform system operations safely.

## Features

### Automatic Command Detection
The system automatically detects when a user message contains shell commands by matching against these patterns:

- `ls` or `dir` - List directory contents
- `cat <file>` - Display file contents
- `mkdir <dir>` - Create directories
- `rm <file>` - Remove files
- `mv <src> <dest>` - Move/rename files
- `cp <src> <dest>` - Copy files
- `touch <file>` - Create empty files
- `echo <text> > <file>` - Write text to files
- `head <file>` - Show first lines of files
- `tail <file>` - Show last lines of files
- `wc <file>` - Word count
- `find <pattern>` - Find files
- `grep <pattern>` - Search in files

### Security Features

1. **Safe Path Validation**: Only allows access to user-accessible directories (Home, Documents, Downloads, Desktop)
2. **Blocked System Paths**: Prevents access to critical system directories like `/System`, `/usr`, `/bin`, `/etc`
3. **Command Whitelist**: Only allows specific safe commands, no arbitrary command execution
4. **Argument Sanitization**: Prevents injection attacks through command arguments
5. **Environment Isolation**: Runs commands with restricted PATH and environment variables

### User Experience

1. **Command Detection**: Messages containing shell commands show an "Execute Command" button
2. **Visual Feedback**: Loading indicator during command execution
3. **Result Display**: Command output shown in a formatted code block
4. **Status Indicators**: Success/error status with colored indicators
5. **Persistent Results**: Command results are saved with the chat session

## Example Usage

Type any of these messages in the chat:

```
ls ~/Documents
cat ~/.bashrc
mkdir ~/test-folder
echo "Hello World" > ~/test.txt
head ~/test.txt
```

The system will:
1. Detect the command automatically
2. Show an "Execute Command" button
3. Execute the command safely when clicked
4. Display the output in the chat
5. Save the result to the session

## Implementation Details

### Frontend (Vue.js)
- `ChatMessage.vue`: Enhanced to detect and execute shell commands
- Pattern matching for command detection
- Tauri API integration for secure execution
- Real-time result display

### Backend (Rust/Tauri)
- `execute_shell_command`: Secure command execution function
- Path safety validation
- Command whitelist enforcement
- Environment restriction

### Data Persistence
- Command results stored in chat sessions
- Full command history maintained
- Searchable command outputs

## Safety Considerations

This implementation prioritizes security:

- **No arbitrary code execution**: Only whitelisted commands allowed
- **Path restrictions**: Cannot access system directories
- **Input validation**: All arguments are sanitized
- **Environment isolation**: Limited environment variables
- **User consent**: Commands require explicit execution (click to run)

The system is designed to be helpful for file management and basic system operations while maintaining security boundaries appropriate for a consumer desktop application.
