import { invoke } from '@tauri-apps/api/core'

export interface FileInfo {
  name: string
  path: string
  is_directory: boolean
  size?: number
  modified?: string
  extension?: string
}

export interface DirectoryListing {
  path: string
  parent?: string
  items: FileInfo[]
}

export interface ShellCommandResult {
  success: boolean
  stdout: string
  stderr: string
  exit_code?: number
}

export class FileManager {
  /**
   * Execute a shell command safely
   */
  private async executeShellCommand(
    command: string,
    args: string[],
    workingDir?: string
  ): Promise<ShellCommandResult> {
    try {
      return await invoke<ShellCommandResult>('execute_shell_command', {
        command,
        args,
        workingDir
      })
    } catch (error) {
      throw new Error(`Shell command failed: ${error}`)
    }
  }

  /**
   * Read the contents of a text file
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const result = await this.executeShellCommand('cat', [filePath])
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error reading file')
      }
      return result.stdout
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`)
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Create parent directory if needed
      const parentDir = this.getParentDirectory(filePath)
      if (parentDir !== filePath) {
        await this.createDirectory(parentDir)
      }
      
      // First create an empty file
      const touchResult = await this.executeShellCommand('touch', [filePath])
      if (!touchResult.success) {
        throw new Error(touchResult.stderr || 'Failed to create file')
      }
      
      // Use a more secure method for writing content
      // Escape single quotes by replacing them with '"'"' pattern
      const escapedContent = content.replace(/'/g, `'"'"'`)
      const writeCommand = `echo '${escapedContent}' > '${filePath}'`
      
      const result = await this.executeShellCommand('sh', ['-c', writeCommand])
      
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error writing file')
      }
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`)
    }
  }

  /**
   * List the contents of a directory
   */
  async listDirectory(dirPath: string): Promise<DirectoryListing> {
    try {
      // Use ls with detailed format (remove --time-style for better compatibility)
      const result = await this.executeShellCommand('ls', ['-la', dirPath])
      
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error listing directory')
      }
      
      const items: FileInfo[] = []
      const lines = result.stdout.split('\n').filter(line => line.trim() && !line.startsWith('total'))
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 9) {
          const permissions = parts[0]
          const size = parseInt(parts[4]) || 0
          const dateTime = parts.slice(5, 8).join(' ') // More flexible date parsing
          const name = parts.slice(8).join(' ')
          
          // Skip . and .. entries
          if (name === '.' || name === '..') continue
          
          const fullPath = this.joinPath(dirPath, name)
          const isDirectory = permissions.startsWith('d')
          
          items.push({
            name,
            path: fullPath,
            is_directory: isDirectory,
            size: isDirectory ? undefined : size,
            modified: dateTime,
            extension: isDirectory ? undefined : this.getFileExtension(name)
          })
        }
      }
      
      // Sort items: directories first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.is_directory && !b.is_directory) return -1
        if (!a.is_directory && b.is_directory) return 1
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      })
      
      return {
        path: dirPath,
        parent: this.getParentDirectory(dirPath),
        items
      }
    } catch (error) {
      throw new Error(`Failed to list directory: ${error}`)
    }
  }

  /**
   * Create a new directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      const result = await this.executeShellCommand('mkdir', ['-p', dirPath])
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error creating directory')
      }
    } catch (error) {
      throw new Error(`Failed to create directory: ${error}`)
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      // Use rm with recursive flag for directories
      const result = await this.executeShellCommand('rm', ['-rf', filePath])
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error deleting file')
      }
    } catch (error) {
      throw new Error(`Failed to delete file: ${error}`)
    }
  }

  /**
   * Rename or move a file
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      const result = await this.executeShellCommand('mv', [oldPath, newPath])
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error renaming file')
      }
    } catch (error) {
      throw new Error(`Failed to rename file: ${error}`)
    }
  }

  /**
   * Get safe directories that users can access
   */
  async getSafeDirectories(): Promise<string[]> {
    try {
      return await invoke<string[]>('get_safe_directories')
    } catch (error) {
      throw new Error(`Failed to get safe directories: ${error}`)
    }
  }

  /**
   * Check if a path is safe to access
   */
  async checkPathSafety(filePath: string): Promise<boolean> {
    try {
      return await invoke<boolean>('check_path_safety', { filePath })
    } catch (error) {
      console.warn(`Failed to check path safety: ${error}`)
      return false
    }
  }

  /**
   * Copy a file or directory
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const result = await this.executeShellCommand('cp', ['-r', sourcePath, destPath])
      if (!result.success) {
        throw new Error(result.stderr || 'Unknown error copying file')
      }
    } catch (error) {
      throw new Error(`Failed to copy file: ${error}`)
    }
  }

  /**
   * Get file information using stat-like command
   */
  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const result = await this.executeShellCommand('ls', ['-la', filePath])
      if (!result.success) {
        return null
      }
      
      const lines = result.stdout.split('\n').filter(line => line.trim())
      if (lines.length === 0) return null
      
      const line = lines[0]
      const parts = line.trim().split(/\s+/)
      if (parts.length < 9) return null
      
      const permissions = parts[0]
      const size = parseInt(parts[4]) || 0
      const dateTime = parts.slice(5, 8).join(' ') // More flexible date parsing
      const name = this.getFileName(filePath)
      const isDirectory = permissions.startsWith('d')
      
      return {
        name,
        path: filePath,
        is_directory: isDirectory,
        size: isDirectory ? undefined : size,
        modified: dateTime,
        extension: isDirectory ? undefined : this.getFileExtension(name)
      }
    } catch (error) {
      console.warn(`Failed to get file info: ${error}`)
      return null
    }
  }

  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const result = await this.executeShellCommand('ls', [filePath])
      return result.success
    } catch (error) {
      return false
    }
  }

  /**
   * Search for files in a directory
   */
  async findFiles(dirPath: string, pattern: string): Promise<string[]> {
    try {
      const result = await this.executeShellCommand('find', [dirPath, '-name', pattern])
      if (!result.success) {
        throw new Error(result.stderr || 'Find command failed')
      }
      
      return result.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
    } catch (error) {
      throw new Error(`Failed to find files: ${error}`)
    }
  }

  /**
   * Get file extension from path
   */
  getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.')
    if (lastDot === -1 || lastDot === 0) return ''
    return filePath.substring(lastDot + 1).toLowerCase()
  }

  /**
   * Check if file is a text file based on extension
   */
  isTextFile(filePath: string): boolean {
    const textExtensions = [
      'txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css', 'scss', 'sass',
      'xml', 'yml', 'yaml', 'csv', 'log', 'py', 'rs', 'go', 'java', 'cpp',
      'c', 'h', 'php', 'rb', 'sh', 'bat', 'ps1', 'dockerfile', 'gitignore',
      'env', 'config', 'conf', 'ini', 'toml'
    ]
    const extension = this.getFileExtension(filePath)
    return textExtensions.includes(extension)
  }

  /**
   * Check if file is an image based on extension
   */
  isImageFile(filePath: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico']
    const extension = this.getFileExtension(filePath)
    return imageExtensions.includes(extension)
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown'
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  /**
   * Get the parent directory path
   */
  getParentDirectory(filePath: string): string {
    const pathSeparator = filePath.includes('/') ? '/' : '\\'
    const parts = filePath.split(pathSeparator)
    parts.pop() // Remove the last part (file/directory name)
    const parent = parts.join(pathSeparator)
    return parent || (pathSeparator === '/' ? '/' : '\\')
  }

  /**
   * Join path segments safely
   */
  joinPath(...segments: string[]): string {
    // Detect the path separator from the first segment
    const pathSeparator = segments[0] && segments[0].includes('/') ? '/' : '\\'
    
    return segments
      .filter(segment => segment && segment.length > 0)
      .map(segment => segment.replace(/[/\\]+$/, '')) // Remove trailing separators
      .join(pathSeparator)
  }

  /**
   * Get filename from path
   */
  getFileName(filePath: string): string {
    const pathSeparator = filePath.includes('/') ? '/' : '\\'
    const parts = filePath.split(pathSeparator)
    return parts[parts.length - 1] || ''
  }

  /**
   * Validate file name for illegal characters
   */
  isValidFileName(fileName: string): boolean {
    // Check for illegal characters in file names
    const illegalChars = /[<>:"/\\|?*\x00-\x1f]/
    return !illegalChars.test(fileName) && fileName.trim().length > 0
  }

  /**
   * Execute a raw shell command with custom arguments (advanced usage)
   */
  async executeRawCommand(command: string, args: string[], workingDir?: string): Promise<ShellCommandResult> {
    return this.executeShellCommand(command, args, workingDir)
  }
}

// Export singleton instance
export const fileManager = new FileManager()