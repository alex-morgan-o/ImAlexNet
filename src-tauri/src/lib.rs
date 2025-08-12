use std::process::Command;
use serde::{Deserialize, Serialize};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            cerebras_completion,
            cerebras_chat,
            cerebras_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
