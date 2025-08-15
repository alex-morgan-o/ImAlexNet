# AlexNet Session Management System

## Overview

The AlexNet chat session management system provides persistent storage and management of chat conversations through a comprehensive file-based approach. This system replaces the previous localStorage-only approach with a robust, scalable solution that stores sessions in the user's home directory.

## Architecture

### Storage Location

All chat sessions are stored in the user's home directory under `.alexnet/`:

```
~/.alexnet/
├── session-name-abc123def4/
│   └── chat.json
├── another-session-xyz789abc/
│   └── chat.json
└── ...
```

### Directory Structure

- **Root Directory**: `~/.alexnet/` - Main storage directory for all AlexNet data
- **Session Directories**: `[session-name]-[10-random-chars]/` - Individual session folders
- **Session Data**: `chat.json` - Complete session data including messages and metadata

## Session Naming Convention

Each session follows the format: `[session-name]-[10-random-characters]`

- **Session Name**: Descriptive name derived from the first user message or manually specified
- **Random Characters**: 10-character unique identifier using nanoid for collision avoidance
- **Examples**:
  - `code-review-request-a1b2c3d4e5`
  - `database-design-f6g7h8i9j0`
  - `chat-k1l2m3n4o5`

## JSON Schema

### Complete Session Schema (`chat.json`)

```json
{
  "id": "string",
  "name": "string",
  "created_at": "ISO 8601 timestamp",
  "last_modified": "ISO 8601 timestamp",
  "messages": [
    {
      "id": "string",
      "role": "user | assistant | system",
      "content": "string (optional)",
      "code": {
        "language": "string",
        "content": "string"
      },
      "files": ["string array of filenames"],
      "timestamp": "ISO 8601 timestamp",
      "can_apply": "boolean (optional)"
    }
  ],
  "metadata": {
    "model": "string (optional)",
    "total_messages": "number",
    "session_type": "string (chat, task, coding, etc.)",
    "tags": ["string array"]
  }
}
```

### Example Session File

```json
{
  "id": "code-review-request-a1b2c3d4e5",
  "name": "Code Review Request",
  "created_at": "2024-08-14T19:30:00.000Z",
  "last_modified": "2024-08-14T19:35:00.000Z",
  "messages": [
    {
      "id": "1692377400000",
      "role": "user",
      "content": "Can you review this React component for best practices?",
      "files": ["MyComponent.tsx"],
      "timestamp": "2024-08-14T19:30:00.000Z"
    },
    {
      "id": "1692377401000",
      "role": "assistant",
      "content": "I'd be happy to review your React component! Here are some observations...",
      "timestamp": "2024-08-14T19:30:30.000Z"
    }
  ],
  "metadata": {
    "model": "llama3.1-8b",
    "total_messages": 2,
    "session_type": "coding",
    "tags": ["react", "code-review"]
  }
}
```

## Backend API (Rust/Tauri Commands)

### Core Commands

#### `get_alexnet_directory()`
Returns the path to the `.alexnet` directory, creating it if it doesn't exist.

```rust
// Returns: Result<String, String>
// Example: "/Users/username/.alexnet"
```

#### `generate_session_id(session_name: String)`
Generates a unique session ID using the naming convention.

```rust
// Input: "code-review-request"
// Returns: Result<String, String>
// Example: "code-review-request-a1b2c3d4e5"
```

#### `create_chat_session(session_name: String)`
Creates a new chat session with empty message history.

```rust
// Input: "My New Chat"
// Returns: Result<ChatSession, String>
```

#### `save_chat_message(session_id: String, message: ChatMessage)`
Appends a message to an existing session.

```rust
// Updates the session file with the new message
// Returns: Result<(), String>
```

#### `load_chat_session(session_id: String)`
Loads a complete session by ID.

```rust
// Returns: Result<ChatSession, String>
```

#### `list_chat_sessions()`
Returns a list of all available sessions with preview data.

```rust
// Returns: Result<Vec<SessionListItem>, String>
```

#### `delete_chat_session(session_id: String)`
Permanently deletes a session and its directory.

```rust
// Returns: Result<(), String>
```

#### `update_session_metadata(session_id, name?, tags?, session_type?)`
Updates session metadata fields.

```rust
// Returns: Result<(), String>
```

#### `export_chat_session(session_id: String, export_path: String)`
Exports a session to a specified file path.

```rust
// Returns: Result<(), String>
```

## Frontend API (TypeScript)

### SessionManagerService Class

The main service class providing session management functionality.

```typescript
import { sessionManager, SessionManagerService } from './services/sessionManager'
```

### Key Methods

#### Creating Sessions

```typescript
// Create a new session
const session = await sessionManager.createSession('My Chat Session')

// Auto-create session from first message
const session = await sessionManager.createSessionFromMessage('Help me with React')
```

#### Managing Messages

```typescript
// Auto-save message (creates session if needed)
await sessionManager.autoSaveMessage(userMessage)

// Save message to current session
await sessionManager.saveMessage(aiMessage)
```

#### Loading Sessions

```typescript
// Load specific session
const session = await sessionManager.loadSession('session-id-here')

// List all sessions
const sessions = await SessionManagerService.listSessions()
```

#### Session Operations

```typescript
// Update metadata
await sessionManager.updateSessionMetadata(sessionId, {
  name: 'New Session Name',
  tags: ['react', 'debugging'],
  sessionType: 'coding'
})

// Delete session
await SessionManagerService.deleteSession(sessionId)

// Export session
await SessionManagerService.exportSession(sessionId, '/path/to/export.json')
```

## Integration Patterns

### Component Integration

#### ChatView Integration

```typescript
// In ChatView.vue
import { sessionManager } from '../services/sessionManager'

// Auto-save user message
const userMessage = { /* message data */ }
await sessionManager.autoSaveMessage(userMessage)

// Save AI response
const aiMessage = { /* AI response */ }
await sessionManager.saveMessage(aiMessage)
```

#### Toolbar Integration

```typescript
// In Toolbar.vue
import { SessionManagerService } from '../services/sessionManager'

// Load sessions for sidebar
const sessions = await SessionManagerService.listSessions()
```

### Migration from localStorage

The system automatically handles migration from the legacy localStorage approach:

1. **Detection**: Checks for existing `alexnet-chat-session` in localStorage
2. **Migration**: Creates new session and imports messages
3. **Cleanup**: Removes localStorage data after successful migration

## Error Handling

### Common Error Scenarios

1. **Directory Creation Failures**: Handles permission issues when creating `.alexnet` directory
2. **File I/O Errors**: Graceful handling of read/write failures
3. **JSON Parsing Errors**: Robust parsing with fallback behavior
4. **Session Not Found**: Clear error messages for missing sessions

### Error Response Format

```typescript
// All Tauri commands return Result<T, String>
// Frontend handles errors with try/catch blocks

try {
  const session = await sessionManager.loadSession('invalid-id')
} catch (error) {
  console.error('Session not found:', error)
  // Fallback behavior
}
```

## Performance Considerations

### Optimizations

1. **Lazy Loading**: Sessions are only loaded when accessed
2. **Incremental Updates**: Only modified sessions are written to disk
3. **Memory Management**: Large sessions are streamed rather than fully loaded
4. **Index Caching**: Session list is cached and only refreshed when needed

### Scalability

- **File System Limits**: Tested with thousands of sessions
- **Message Limits**: No hard limits, but UI pagination recommended for large sessions
- **Storage Size**: JSON compression for large sessions under consideration

## Security Considerations

### File Permissions

- Session directories created with user-only permissions (700)
- Session files created with user-only read/write (600)
- No sensitive data should be stored in session names or IDs

### Data Privacy

- All data stored locally on user's machine
- No network transmission of session data
- Export functionality allows user-controlled backup

## Development Guidelines

### Adding New Message Types

1. Update the `ChatMessage` interface in both Rust and TypeScript
2. Ensure serialization/deserialization compatibility
3. Update migration logic if breaking changes are introduced

### Extending Metadata

1. Add new fields to `SessionMetadata` struct
2. Update the TypeScript interfaces
3. Implement backward compatibility for existing sessions

### Testing

```bash
# Backend tests
cd src-tauri && cargo test

# Frontend tests  
npm test

# Integration tests
npm run test:e2e
```

## Future Enhancements

### Planned Features

1. **Session Search**: Full-text search across all sessions
2. **Session Tags**: Enhanced tagging and filtering system
3. **Session Templates**: Predefined session types with custom schemas
4. **Cloud Sync**: Optional cloud backup and synchronization
5. **Session Analytics**: Usage statistics and insights

### API Stability

- Current API is considered stable for v1.0
- Breaking changes will be versioned appropriately
- Migration utilities provided for major version updates

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure user has write access to home directory
2. **Corrupted Sessions**: System handles corrupted JSON gracefully
3. **Missing Sessions**: Check `.alexnet` directory exists and has correct permissions

### Debug Commands

```typescript
// Get AlexNet directory path
const alexnetDir = await SessionManagerService.getAlexNetDirectory()
console.log('AlexNet directory:', alexnetDir)

// List all session files
const sessions = await SessionManagerService.listSessions()
console.log('Available sessions:', sessions)
```

### Recovery Procedures

1. **Backup Recovery**: Use export functionality to create backups
2. **Manual Recovery**: Sessions are standard JSON files, can be manually edited
3. **Reset**: Delete `.alexnet` directory to start fresh (loses all data)

## Conclusion

The AlexNet session management system provides a robust, scalable foundation for persistent chat storage. Its file-based approach ensures data durability while maintaining performance and user privacy. The comprehensive API enables rich session management features while maintaining backward compatibility with existing implementations.