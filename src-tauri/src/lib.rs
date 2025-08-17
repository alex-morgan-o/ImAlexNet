use chrono::{DateTime, Utc};
use dirs;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// === Tool availability detection ===
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolInfo {
    installed: bool,
    version: Option<String>,
    path: Option<String>,
    last_updated: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ToolAvailability {
    claude: bool,
    codex: bool,
    gemini: bool,
}

fn command_exists(command: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("where")
            .arg(command)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("sh")
            .arg("-c")
            .arg(format!("command -v {} >/dev/null 2>&1", command))
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

fn find_command_path(command: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("where").arg(command).output().ok().and_then(|o| {
            if o.status.success() {
                let out = String::from_utf8_lossy(&o.stdout).to_string();
                out.lines().next().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("sh")
            .arg("-c")
            .arg(format!("command -v {} 2>/dev/null", command))
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    let out = String::from_utf8_lossy(&o.stdout).to_string();
                    Some(out.trim().to_string())
                } else {
                    None
                }
            })
    }
}

fn get_version_output(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let mut out = String::from_utf8_lossy(&o.stdout).to_string();
                if out.trim().is_empty() {
                    out = String::from_utf8_lossy(&o.stderr).to_string();
                }
                let line = out.lines().next().unwrap_or("").trim().to_string();
                if line.is_empty() {
                    None
                } else {
                    Some(line)
                }
            } else {
                None
            }
        })
}

struct ToolSpec {
    name: &'static str,
    aliases: &'static [&'static str],
    version_args: &'static [&'static str],
}

fn collect_tools_snapshot() -> HashMap<String, ToolInfo> {
    let now = Utc::now();
    let specs: Vec<ToolSpec> = vec![
        // Node.js ecosystem
        ToolSpec { name: "node", aliases: &["node"], version_args: &["--version"] },
        ToolSpec { name: "npm", aliases: &["npm"], version_args: &["--version"] },
        ToolSpec { name: "npx", aliases: &["npx"], version_args: &["--version"] },
        ToolSpec { name: "pnpm", aliases: &["pnpm"], version_args: &["--version"] },
        ToolSpec { name: "yarn", aliases: &["yarn"], version_args: &["--version"] },
        ToolSpec { name: "bun", aliases: &["bun"], version_args: &["--version"] },
        // Python
        ToolSpec { name: "python", aliases: &["python3", "python"], version_args: &["--version"] },
        ToolSpec { name: "pip", aliases: &["pip3", "pip"], version_args: &["--version"] },
        ToolSpec { name: "pipx", aliases: &["pipx"], version_args: &["--version"] },
        ToolSpec { name: "uv", aliases: &["uv"], version_args: &["--version"] },
        ToolSpec { name: "poetry", aliases: &["poetry"], version_args: &["--version"] },
        ToolSpec { name: "conda", aliases: &["conda"], version_args: &["--version"] },
        // Rust
        ToolSpec { name: "rustc", aliases: &["rustc"], version_args: &["--version"] },
        ToolSpec { name: "cargo", aliases: &["cargo"], version_args: &["--version"] },
        // Go
        ToolSpec { name: "go", aliases: &["go"], version_args: &["version"] },
        // .NET
        ToolSpec { name: "dotnet", aliases: &["dotnet"], version_args: &["--version"] },
        // Java
        ToolSpec { name: "java", aliases: &["java"], version_args: &["-version"] },
        ToolSpec { name: "javac", aliases: &["javac"], version_args: &["-version"] },
        ToolSpec { name: "mvn", aliases: &["mvn"], version_args: &["-v"] },
        ToolSpec { name: "gradle", aliases: &["gradle"], version_args: &["-v"] },
        // Ruby
        ToolSpec { name: "ruby", aliases: &["ruby"], version_args: &["--version"] },
        ToolSpec { name: "gem", aliases: &["gem"], version_args: &["--version"] },
        ToolSpec { name: "bundler", aliases: &["bundler", "bundle"], version_args: &["--version"] },
        // PHP
        ToolSpec { name: "php", aliases: &["php"], version_args: &["--version"] },
        ToolSpec { name: "composer", aliases: &["composer"], version_args: &["--version"] },
        // Swift
        ToolSpec { name: "swift", aliases: &["swift"], version_args: &["--version"] },
        ToolSpec { name: "xcodebuild", aliases: &["xcodebuild"], version_args: &["-version"] },
        // VCS + tooling
        ToolSpec { name: "git", aliases: &["git"], version_args: &["--version"] },
        ToolSpec { name: "gh", aliases: &["gh"], version_args: &["--version"] },
        ToolSpec { name: "git-lfs", aliases: &["git-lfs"], version_args: &["--version"] },
        ToolSpec { name: "tsc", aliases: &["tsc"], version_args: &["-v"] },
        ToolSpec { name: "eslint", aliases: &["eslint"], version_args: &["-v"] },
        ToolSpec { name: "prettier", aliases: &["prettier"], version_args: &["-v"] },
        ToolSpec { name: "vite", aliases: &["vite"], version_args: &["--version"] },
        ToolSpec { name: "webpack", aliases: &["webpack"], version_args: &["--version"] },
        ToolSpec { name: "rollup", aliases: &["rollup"], version_args: &["--version"] },
        ToolSpec { name: "parcel", aliases: &["parcel"], version_args: &["--version"] },
        ToolSpec { name: "jest", aliases: &["jest"], version_args: &["--version"] },
        ToolSpec { name: "vitest", aliases: &["vitest"], version_args: &["--version"] },
        ToolSpec { name: "mocha", aliases: &["mocha"], version_args: &["--version"] },
        ToolSpec { name: "playwright", aliases: &["playwright"], version_args: &["--version"] },
        ToolSpec { name: "cypress", aliases: &["cypress"], version_args: &["--version"] },
        // Containers
        ToolSpec { name: "docker", aliases: &["docker"], version_args: &["--version"] },
        ToolSpec { name: "docker-compose", aliases: &["docker-compose"], version_args: &["--version"] },
        // Cloud/AI
        ToolSpec { name: "openai", aliases: &["openai"], version_args: &["--version"] },
        ToolSpec { name: "claude", aliases: &["claude"], version_args: &["--version"] },
        ToolSpec { name: "gcloud", aliases: &["gcloud"], version_args: &["--version"] },
        ToolSpec { name: "aws", aliases: &["aws"], version_args: &["--version"] },
        ToolSpec { name: "az", aliases: &["az"], version_args: &["--version"] },
        ToolSpec { name: "ollama", aliases: &["ollama"], version_args: &["--version"] },
        ToolSpec { name: "huggingface-cli", aliases: &["huggingface-cli"], version_args: &["--version"] },
        ToolSpec { name: "codex", aliases: &["codex"], version_args: &["--version"] },
        ToolSpec { name: "gemini", aliases: &["gemini"], version_args: &["--version"] },
        // CLI utils
        ToolSpec { name: "curl", aliases: &["curl"], version_args: &["--version"] },
        ToolSpec { name: "wget", aliases: &["wget"], version_args: &["--version"] },
        ToolSpec { name: "jq", aliases: &["jq"], version_args: &["--version"] },
        ToolSpec { name: "yq", aliases: &["yq"], version_args: &["--version"] },
        ToolSpec { name: "tar", aliases: &["tar"], version_args: &["--version"] },
        ToolSpec { name: "unzip", aliases: &["unzip"], version_args: &["-v"] },
        ToolSpec { name: "zip", aliases: &["zip"], version_args: &["-v"] },
        // DB clients
        ToolSpec { name: "sqlite3", aliases: &["sqlite3"], version_args: &["--version"] },
        ToolSpec { name: "psql", aliases: &["psql"], version_args: &["--version"] },
        ToolSpec { name: "mysql", aliases: &["mysql"], version_args: &["--version"] },
        // Package managers
        ToolSpec { name: "brew", aliases: &["brew"], version_args: &["--version"] },
    ];

    let mut map: HashMap<String, ToolInfo> = HashMap::new();

    for spec in specs.iter() {
        let mut found_path: Option<String> = None;
        let mut version: Option<String> = None;
        for &alias in spec.aliases.iter() {
            if let Some(path) = find_command_path(alias) {
                found_path = Some(path);
                version = get_version_output(alias, spec.version_args);
                break;
            }
        }
        let info = ToolInfo {
            installed: found_path.is_some(),
            version,
            path: found_path,
            last_updated: now,
        };
        map.insert(spec.name.to_string(), info);
    }

    // Special handling for Docker Compose v2 (docker compose)
    if map
        .get("docker")
        .map(|i| i.installed)
        .unwrap_or(false)
    {
        let compose_v2 = Command::new("docker")
            .args(["compose", "version"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    let mut out = String::from_utf8_lossy(&o.stdout).to_string();
                    if out.trim().is_empty() {
                        out = String::from_utf8_lossy(&o.stderr).to_string();
                    }
                    let line = out.lines().next().unwrap_or("").trim().to_string();
                    if line.is_empty() { None } else { Some(line) }
                } else {
                    None
                }
            });
        if let Some(v) = compose_v2 {
            map.insert(
                "dockerCompose".to_string(),
                ToolInfo {
                    installed: true,
                    version: Some(v),
                    path: map.get("docker").and_then(|d| d.path.clone()),
                    last_updated: now,
                },
            );
        }
    }

    map
}

fn get_or_create_alexnet_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    let alexnet_dir = home.join(".alexnet");
    if !alexnet_dir.exists() {
        fs::create_dir_all(&alexnet_dir)
            .map_err(|e| format!("Failed to create .alexnet directory: {}", e))?;
    }
    Ok(alexnet_dir)
}

fn save_tools_snapshot(snapshot: &HashMap<String, ToolInfo>) -> Result<(), String> {
    let dir = get_or_create_alexnet_dir()?;
    let path = dir.join("tools.json");
    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("Failed to serialize tools snapshot: {}", e))?;
    fs::write(path, json)
        .map_err(|e| format!("Failed to write tools.json: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_tool_availability() -> Result<ToolAvailability, String> {
    let snapshot = collect_tools_snapshot();
    // Persist extended snapshot
    if let Err(e) = save_tools_snapshot(&snapshot) {
        eprintln!("Failed to persist tool snapshot: {}", e);
    }
    // Back-compat: surface primary tools as booleans
    let availability = ToolAvailability {
        claude: snapshot.get("claude").map(|t| t.installed).unwrap_or(false),
        codex: snapshot.get("codex").map(|t| t.installed).unwrap_or(false),
        gemini: snapshot.get("gemini").map(|t| t.installed).unwrap_or(false),
    };
    Ok(availability)
}

#[tauri::command]
fn get_tools_snapshot() -> Result<HashMap<String, ToolInfo>, String> {
    let snapshot = collect_tools_snapshot();
    if let Err(e) = save_tools_snapshot(&snapshot) {
        eprintln!("Failed to persist tool snapshot: {}", e);
    }
    Ok(snapshot)
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
    command_result: Option<ShellCommandResult>,
    is_executing_command: Option<bool>,
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

// File system structures
#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    name: String,
    path: String,
    is_directory: bool,
    size: Option<u64>,
    modified: Option<DateTime<Utc>>,
    extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DirectoryListing {
    path: String,
    parent: Option<String>,
    items: Vec<FileInfo>,
}

// Security: Define system directories and sensitive paths to block
static BLOCKED_PATHS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    let mut set = HashSet::new();
    // System directories (Unix/Linux/macOS)
    set.insert("/System");
    set.insert("/usr");
    set.insert("/bin");
    set.insert("/sbin");
    set.insert("/boot");
    set.insert("/dev");
    set.insert("/proc");
    set.insert("/sys");
    set.insert("/etc");
    set.insert("/root");
    set.insert("/var/log");
    set.insert("/var/run");
    set.insert("/private");
    // Windows system directories
    set.insert("C:\\Windows");
    set.insert("C:\\Program Files");
    set.insert("C:\\Program Files (x86)");
    set.insert("C:\\ProgramData");
    set.insert("C:\\System32");
    set.insert("C:\\SysWOW64");
    // macOS specific
    set.insert("/Library/LaunchDaemons");
    set.insert("/Library/LaunchAgents");
    set.insert("/Library/StartupItems");
    set
});

// Security: Check if a path is safe to access
fn is_path_safe(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Check against blocked system paths
    for blocked in BLOCKED_PATHS.iter() {
        if path_str.starts_with(blocked) {
            return false;
        }
    }

    // Don't allow access to hidden system files that start with .
    // But allow .alexnet and other user-created hidden files in home directory
    if let Some(home) = dirs::home_dir() {
        if !path.starts_with(&home) {
            // If not in home directory, be more restrictive
            if let Some(file_name) = path.file_name() {
                let name = file_name.to_string_lossy();
                if name.starts_with('.') && !name.starts_with(".alexnet") {
                    return false;
                }
            }
        }
    }

    // Additional checks for sensitive files
    let sensitive_files = [
        "passwd",
        "shadow",
        "sudoers",
        "hosts",
        "fstab",
        "ssh_config",
        "sshd_config",
        "authorized_keys",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
    ];

    if let Some(file_name) = path.file_name() {
        let name = file_name.to_string_lossy().to_lowercase();
        for sensitive in &sensitive_files {
            if name.contains(sensitive) {
                return false;
            }
        }
    }

    true
}

// Get safe working directories (user-accessible locations)
fn get_safe_base_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = dirs::home_dir() {
        dirs.push(home);
    }
    if let Some(documents) = dirs::document_dir() {
        dirs.push(documents);
    }
    if let Some(downloads) = dirs::download_dir() {
        dirs.push(downloads);
    }
    if let Some(desktop) = dirs::desktop_dir() {
        dirs.push(desktop);
    }

    dirs
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
        "max_tokens": max_tokens.unwrap_or(8192),
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
        "max_tokens": max_tokens.unwrap_or(8192),
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
        eprintln!("🔥 Cerebras chat stderr: {}", stderr);
        return Err(format!("Cerebras script failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Extract JSON from output (skip dotenv debug info)
    // Look for the actual JSON response by finding the first occurrence of {"success"
    let json_start = stdout.find("{\"success\"").unwrap_or_else(|| {
        eprintln!("⚠️ Could not find {{\"success\" pattern, falling back to first {{");
        // Fallback: look for any { that's followed by a quote (proper JSON)
        stdout.find("{\n  \"").unwrap_or(0)
    });
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
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let alexnet_dir = home.join(".alexnet");

    // Create directory if it doesn't exist
    if !alexnet_dir.exists() {
        fs::create_dir_all(&alexnet_dir)
            .map_err(|e| format!("Failed to create .alexnet directory: {}", e))?;
    }

    alexnet_dir
        .to_string_lossy()
        .to_string()
        .parse()
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
    tokio::fs::create_dir_all(&session_dir)
        .await
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

    tokio::fs::write(chat_file, session_json)
        .await
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

    tokio::fs::write(chat_file, session_json)
        .await
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

    let session_data = tokio::fs::read_to_string(chat_file)
        .await
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
    let mut entries = tokio::fs::read_dir(alexnet_path)
        .await
        .map_err(|e| format!("Failed to read .alexnet directory: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read directory entry: {}", e))?
    {
        if entry
            .file_type()
            .await
            .map_err(|e| format!("Failed to get file type: {}", e))?
            .is_dir()
        {
            let session_dir = entry.path();
            let chat_file = session_dir.join("chat.json");

            if chat_file.exists() {
                match tokio::fs::read_to_string(chat_file).await {
                    Ok(session_data) => {
                        match serde_json::from_str::<ChatSession>(&session_data) {
                            Ok(session) => {
                                let preview = session
                                    .messages
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
        tokio::fs::remove_dir_all(session_dir)
            .await
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

    tokio::fs::write(chat_file, session_json)
        .await
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn export_chat_session(session_id: String, export_path: String) -> Result<(), String> {
    let session = load_chat_session(session_id).await?;

    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    tokio::fs::write(export_path, session_json)
        .await
        .map_err(|e| format!("Failed to export session: {}", e))?;

    Ok(())
}

// Shell Command Execution

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ShellCommandResult {
    success: bool,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
}

// Security: Validate shell command arguments to prevent dangerous operations
fn validate_shell_command(command: &str, args: &[String]) -> Result<(), String> {
    // Allow only specific safe commands for file operations
    let allowed_commands = [
        "cat", "ls", "mkdir", "rm", "mv", "cp", "touch", "echo", "head", "tail", "wc", "find",
        "grep", "sed", "awk", "sh",
    ];

    if !allowed_commands.contains(&command) {
        return Err(format!("Command '{}' is not allowed", command));
    }

    // Special handling for sh command - only allow specific patterns
    if command == "sh" {
        if args.len() != 2 || args[0] != "-c" {
            return Err("sh command only allows -c flag with single command string".to_string());
        }
        // Allow echo redirection for file writing, but validate the paths
        let cmd_string = &args[1];
        if !cmd_string.starts_with("echo") || !cmd_string.contains(">") {
            return Err("sh -c only allows echo redirection commands".to_string());
        }
        return Ok(()); // Skip further validation for sh -c as we control the format
    }

    // Check for dangerous argument patterns
    for arg in args {
        // Allow some redirections for specific commands, but be careful
        let dangerous_chars = [";", "|", "&", "`", "$("];
        for &dangerous in &dangerous_chars {
            if arg.contains(dangerous) {
                return Err(format!(
                    "Dangerous character '{}' detected in arguments",
                    dangerous
                ));
            }
        }

        // Validate paths in arguments - be more permissive for relative paths
        if arg.starts_with("/") || arg.starts_with("~") {
            let path = if arg.starts_with("~") {
                if let Some(home) = dirs::home_dir() {
                    home.join(&arg[2..]) // Skip "~/"
                } else {
                    return Err("Cannot resolve home directory".to_string());
                }
            } else {
                PathBuf::from(arg)
            };

            if !is_path_safe(&path) {
                return Err(format!("Path '{}' is not safe", arg));
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn execute_shell_command(
    command: String,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<ShellCommandResult, String> {
    // Validate the command and arguments
    validate_shell_command(&command, &args)?;

    // Expand user-home shortcuts in args (e.g., ~/Downloads) since we don't run through a shell
    fn expand_user_path(arg: &str) -> String {
        if arg == "~" {
            if let Some(home) = dirs::home_dir() {
                return home.to_string_lossy().to_string();
            }
        } else if let Some(rest) = arg.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(rest).to_string_lossy().to_string();
            }
        } else if let Some(rest) = arg.strip_prefix("$HOME/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(rest).to_string_lossy().to_string();
            }
        }
        arg.to_string()
    }
    let expanded_args: Vec<String> = args.iter().map(|a| expand_user_path(a)).collect();

    // Set working directory with safety check
    let work_dir = if let Some(dir) = working_dir {
        let path = PathBuf::from(&dir);
        if !is_path_safe(&path) {
            return Err(format!("Working directory '{}' is not safe", dir));
        }
        if !path.exists() {
            return Err(format!("Working directory '{}' does not exist", dir));
        }
        Some(path)
    } else {
        // Default to home directory or first safe directory
        get_safe_base_directories().into_iter().next()
    };

    // Execute the command
    let mut cmd = Command::new(&command);
    // Use expanded args to support paths like ~/Downloads without invoking a shell
    cmd.args(&expanded_args);

    if let Some(dir) = work_dir {
        cmd.current_dir(dir);
    }

    // Set environment variables for safety
    cmd.env("PATH", "/usr/local/bin:/usr/bin:/bin"); // Restrict PATH
    cmd.env_remove("SHELL"); // Remove shell environment for extra safety

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute command '{}': {}", command, e))?;

    Ok(ShellCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

#[tauri::command]
fn get_safe_directories() -> Result<Vec<String>, String> {
    let safe_dirs = get_safe_base_directories();
    let paths = safe_dirs
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(paths)
}

#[tauri::command]
fn check_path_safety(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);
    Ok(is_path_safe(path))
}

// Workspace management (~/AlexNet)
#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceStatus {
    path: String,
    exists: bool,
}

fn get_workspace_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join("AlexNet"))
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(alias = "workspace_path")]
    workspace_path: Option<String>,
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(get_or_create_alexnet_dir()?.join("settings.json"))
}

fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    serde_json::from_str::<AppSettings>(&data)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))
}

fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write settings.json: {}", e))
}

#[tauri::command]
fn get_workspace_status() -> Result<WorkspaceStatus, String> {
    let path = get_workspace_path()?;
    let exists = path.exists();
    let path_str = path.to_string_lossy().to_string();

    // Keep settings.json updated with workspace path
    let mut settings = load_settings().unwrap_or_default();
    if settings.workspace_path.as_deref() != Some(&path_str) {
        settings.workspace_path = Some(path_str.clone());
        if let Err(e) = save_settings(&settings) {
            eprintln!("Failed to update settings.json with workspace path: {}", e);
        }
    }

    Ok(WorkspaceStatus { path: path_str, exists })
}

#[tauri::command]
fn create_workspace() -> Result<(), String> {
    let path = get_workspace_path()?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create workspace: {}", e))?;
    }
    // Persist workspace path in settings.json
    let mut settings = load_settings().unwrap_or_default();
    settings.workspace_path = Some(path.to_string_lossy().to_string());
    save_settings(&settings).ok();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // On app launch, detect and emit tool availability to the frontend
            let snapshot = collect_tools_snapshot();
            let availability = ToolAvailability {
                claude: snapshot.get("claude").map(|t| t.installed).unwrap_or(false),
                codex: snapshot.get("codex").map(|t| t.installed).unwrap_or(false),
                gemini: snapshot.get("gemini").map(|t| t.installed).unwrap_or(false),
            };
            let _ = app.emit("tools:availability", availability);
            // Persist extended snapshot to ~/.alexnet/tools.json at startup
            if let Err(e) = save_tools_snapshot(&snapshot) {
                eprintln!("Failed to persist tool snapshot at startup: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_tool_availability,
            get_tools_snapshot,
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
            export_chat_session,
            execute_shell_command,
            get_safe_directories,
            check_path_safety,
            get_workspace_status,
            create_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
