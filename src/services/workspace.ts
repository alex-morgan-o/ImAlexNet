import { invoke } from '@tauri-apps/api/core'

export interface WorkspaceStatus {
  path: string
  exists: boolean
}

export async function getWorkspaceStatus(): Promise<WorkspaceStatus> {
  return await invoke<WorkspaceStatus>('get_workspace_status')
}

export async function createWorkspace(): Promise<void> {
  await invoke<void>('create_workspace')
}

export async function setWorkspacePath(path: string): Promise<void> {
  await invoke<void>('set_workspace_path', { path })
}

