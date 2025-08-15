use std::process::Command;
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use dirs;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize)]
struct CerebrasResponse {
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
    details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ChatMessage {
    id: String,
    role: String, // "user" | "assistant" | "system"
    content: Option<String>,
    code: Option<CodeBlock>,
    files: Vec<String>, // File names/paths
    timestamp: DateTime<Utc>,
    can_apply: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CodeBlock {
    language: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatSession {
    id: String,
    name: String,
    created_at: DateTime<Utc>,
    last_modified: DateTime<Utc>,
    messages: Vec<ChatMessage>,
    metadata: SessionMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionMetadata {
    model: Option<String>,
    total_messages: usize,
    session_type: String, // "chat", "task", "coding", etc.
    tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionListItem {
    id: String,
    name: String,
    created_at: DateTime<Utc>,
    last_modified: DateTime<Utc>,
    message_count: usize,
    preview: Option<String>, // First user message or summary
}

#[tauri::command]
async fn cerebras_completion(
    prompt: String,
    model: Option<String>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: Option<bool>,
) -> Result<CerebrasResponse, String> {
    let script_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?
        .join("scripts/cerebras/cerebras-client.cjs");

    let options = serde_json::json!({
        "model": model.unwrap_or_else(|| "llama3.1-8b".to_string()),
        "max_tokens": max_tokens.unwrap_or(100),
        "temperature": temperature.unwrap_or(0.7),
        "stream": stream.unwrap_or(false)
    });

    let output = Command::new("node")
        .arg(&script_path)
        .arg("completion")
        .arg(&prompt)
        .arg(&options.to_string())
        .output()
        .map_err(|e| format!("Failed to execute cerebras script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Cerebras script failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Extract JSON from output (skip dotenv debug info)
    let json_start = stdout.find('{').unwrap_or(0);
    let json_content = &stdout[json_start..];
    
    let response: CerebrasResponse = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse cerebras response: {}", e))?;

    Ok(response)
}

#[tauri::command]
async fn cerebras_chat(
    messages: Vec<serde_json::Value>,
    model: Option<String>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: Option<bool>,
) -> Result<CerebrasResponse, String> {
    let script_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?
        .join("scripts/cerebras/cerebras-client.cjs");

    let messages_json = serde_json::to_string(&messages)
        .map_err(|e| format!("Failed to serialize messages: {}", e))?;

    let options = serde_json::json!({
        "model": model.unwrap_or_else(|| "llama3.1-8b".to_string()),
        "max_tokens": max_tokens.unwrap_or(100),
        "temperature": temperature.unwrap_or(0.7),
        "stream": stream.unwrap_or(false)
    });

    let output = Command::new("node")
        .arg(&script_path)
        .arg("chat")
        .arg(&messages_json)
        .arg(&options.to_string())
        .output()
        .map_err(|e| format!("Failed to execute cerebras script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Cerebras script failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Extract JSON from output (skip dotenv debug info)
    let json_start = stdout.find('{').unwrap_or(0);
    let json_content = &stdout[json_start..];
    
    let response: CerebrasResponse = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse cerebras response: {}", e))?;

    Ok(response)
}

#[tauri::command]
async fn cerebras_models() -> Result<CerebrasResponse, String> {
    let script_path = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?
        .join("scripts/cerebras/cerebras-client.cjs");

    let output = Command::new("node")
        .arg(&script_path)
        .arg("models")
        .output()
        .map_err(|e| format!("Failed to execute cerebras script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Cerebras script failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Extract JSON from output (skip dotenv debug info)
    let json_start = stdout.find('{').unwrap_or(0);
    let json_content = &stdout[json_start..];
    
    let response: CerebrasResponse = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse cerebras response: {}", e))?;

    Ok(response)
}

// Session Management Commands

#[tauri::command]
fn get_alexnet_directory() -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let alexnet_dir = home.join(".alexnet");
    
    // Create directory if it doesn't exist
    if !alexnet_dir.exists() {
        fs::create_dir_all(&alexnet_dir)
            .map_err(|e| format!("Failed to create .alexnet directory: {}", e))?;
    }
    
    alexnet_dir.to_string_lossy().to_string().parse()
        .map_err(|e| format!("Invalid directory path: {}", e))
}

#[tauri::command]
fn generate_session_id(session_name: String) -> Result<String, String> {
    // Generate 10 random characters using UUID and taking first 10 chars
    let uuid = Uuid::new_v4().to_string().replace("-", "");
    let random_chars = &uuid[..10];
    
    // Format: [session-name]-[10-random-characters]
    let session_id = format!("{}-{}", session_name, random_chars);
    Ok(session_id)
}

#[tauri::command]
async fn create_chat_session(session_name: String) -> Result<ChatSession, String> {
    let alexnet_dir = get_alexnet_directory()?;
    let session_id = generate_session_id(session_name.clone())?;
    
    let session_dir = PathBuf::from(alexnet_dir).join(&session_id);
    
    // Create session directory
    tokio::fs::create_dir_all(&session_dir).await
        .map_err(|e| format!("Failed to create session directory: {}", e))?;
    
    let session = ChatSession {
        id: session_id.clone(),
        name: session_name,
        created_at: Utc::now(),
        last_modified: Utc::now(),
        messages: vec![],
        metadata: SessionMetadata {
            model: None,
            total_messages: 0,
            session_type: "chat".to_string(),
            tags: vec![],
        },
    };
    
    // Save session to chat.json
    let chat_file = session_dir.join("chat.json");
    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    tokio::fs::write(chat_file, session_json).await
        .map_err(|e| format!("Failed to write session file: {}", e))?;
    
    Ok(session)
}

#[tauri::command]
async fn save_chat_message(session_id: String, message: ChatMessage) -> Result<(), String> {
    let alexnet_dir = get_alexnet_directory()?;
    let session_dir = PathBuf::from(alexnet_dir).join(&session_id);
    let chat_file = session_dir.join("chat.json");
    
    // Load existing session
    let mut session = load_chat_session(session_id.clone()).await?;
    
    // Add new message
    session.messages.push(message);
    session.last_modified = Utc::now();
    session.metadata.total_messages = session.messages.len();
    
    // Save updated session
    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    tokio::fs::write(chat_file, session_json).await
        .map_err(|e| format!("Failed to write session file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_chat_session(session_id: String) -> Result<ChatSession, String> {
    let alexnet_dir = get_alexnet_directory()?;
    let session_dir = PathBuf::from(alexnet_dir).join(&session_id);
    let chat_file = session_dir.join("chat.json");
    
    if !chat_file.exists() {
        return Err(format!("Session '{}' not found", session_id));
    }
    
    let session_data = tokio::fs::read_to_string(chat_file).await
        .map_err(|e| format!("Failed to read session file: {}", e))?;
    
    let session: ChatSession = serde_json::from_str(&session_data)
        .map_err(|e| format!("Failed to parse session file: {}", e))?;
    
    Ok(session)
}

#[tauri::command]
async fn list_chat_sessions() -> Result<Vec<SessionListItem>, String> {
    let alexnet_dir = get_alexnet_directory()?;
    let alexnet_path = PathBuf::from(alexnet_dir);
    
    if !alexnet_path.exists() {
        return Ok(vec![]);
    }
    
    let mut sessions = vec![];
    let mut entries = tokio::fs::read_dir(alexnet_path).await
        .map_err(|e| format!("Failed to read .alexnet directory: {}", e))?;
    
    while let Some(entry) = entries.next_entry().await
        .map_err(|e| format!("Failed to read directory entry: {}", e))? {
        
        if entry.file_type().await
            .map_err(|e| format!("Failed to get file type: {}", e))?.is_dir() {
            
            let session_dir = entry.path();
            let chat_file = session_dir.join("chat.json");
            
            if chat_file.exists() {
                match tokio::fs::read_to_string(chat_file).await {
                    Ok(session_data) => {
                        match serde_json::from_str::<ChatSession>(&session_data) {
                            Ok(session) => {
                                let preview = session.messages
                                    .iter()
                                    .find(|m| m.role == "user")
                                    .and_then(|m| m.content.as_ref())
                                    .map(|content| {
                                        if content.len() > 100 {
                                            format!("{}...", &content[..100])
                                        } else {
                                            content.clone()
                                        }
                                    });
                                
                                sessions.push(SessionListItem {
                                    id: session.id,
                                    name: session.name,
                                    created_at: session.created_at,
                                    last_modified: session.last_modified,
                                    message_count: session.messages.len(),
                                    preview,
                                });
                            }
                            Err(_) => continue, // Skip invalid session files
                        }
                    }
                    Err(_) => continue, // Skip unreadable files
                }
            }
        }
    }
    
    // Sort by last modified date (most recent first)
    sessions.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    
    Ok(sessions)
}

#[tauri::command]
async fn delete_chat_session(session_id: String) -> Result<(), String> {
    let alexnet_dir = get_alexnet_directory()?;
    let session_dir = PathBuf::from(alexnet_dir).join(&session_id);
    
    if session_dir.exists() {
        tokio::fs::remove_dir_all(session_dir).await
            .map_err(|e| format!("Failed to delete session: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn update_session_metadata(
    session_id: String,
    name: Option<String>,
    tags: Option<Vec<String>>,
    session_type: Option<String>,
) -> Result<(), String> {
    let mut session = load_chat_session(session_id.clone()).await?;
    
    // Update fields if provided
    if let Some(new_name) = name {
        session.name = new_name;
    }
    if let Some(new_tags) = tags {
        session.metadata.tags = new_tags;
    }
    if let Some(new_type) = session_type {
        session.metadata.session_type = new_type;
    }
    
    session.last_modified = Utc::now();
    
    // Save updated session
    let alexnet_dir = get_alexnet_directory()?;
    let session_dir = PathBuf::from(alexnet_dir).join(&session_id);
    let chat_file = session_dir.join("chat.json");
    
    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    tokio::fs::write(chat_file, session_json).await
        .map_err(|e| format!("Failed to write session file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn export_chat_session(session_id: String, export_path: String) -> Result<(), String> {
    let session = load_chat_session(session_id).await?;
    
    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    tokio::fs::write(export_path, session_json).await
        .map_err(|e| format!("Failed to export session: {}", e))?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            cerebras_completion,
            cerebras_chat,
            cerebras_models,
            get_alexnet_directory,
            generate_session_id,
            create_chat_session,
            save_chat_message,
            load_chat_session,
            list_chat_sessions,
            delete_chat_session,
            update_session_metadata,
            export_chat_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
