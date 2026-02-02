import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

export function ensureGitignoreEntry(logDir: string): void {
  try {
    // Find the git repository root
    const gitRoot = findGitRoot(logDir);
    if (!gitRoot) {
      return; // Not in a git repository
    }

    const gitignorePath = join(gitRoot, '.gitignore');
    
    // Calculate relative path from git root to log directory
    const relativeLogDir = relative(gitRoot, logDir);
    
    // Normalize path separators for .gitignore (always use forward slashes)
    const normalizedPath = relativeLogDir.replace(/\\/g, '/');
    
    // Determine what entry to add
    const entry = normalizedPath.startsWith('.') 
      ? normalizedPath 
      : normalizedPath + '/';

    if (!existsSync(gitignorePath)) {
      // Create new .gitignore with the entry
      writeFileSync(gitignorePath, `# Logs\n${entry}\n`, 'utf8');
      console.log(`[AgentLogger] Created .gitignore with log directory entry: ${entry}`);
      return;
    }

    // Read existing .gitignore
    const content = readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n');
    
    // Check if entry already exists (handle various formats)
    const entryPatterns = [
      entry,
      entry + '/',
      normalizedPath,
      normalizedPath + '/',
      normalizedPath.replace(/^\//, ''), // Without leading slash
      normalizedPath.replace(/^\//, '') + '/',
    ];
    
    const hasEntry = lines.some(line => {
      const trimmed = line.trim();
      return entryPatterns.some(pattern => 
        trimmed === pattern || 
        trimmed === pattern + '/' ||
        trimmed.startsWith(pattern + '/')
      );
    });

    if (hasEntry) {
      return; // Entry already exists
    }

    // Add entry to .gitignore
    const newContent = content.endsWith('\n') 
      ? content + `# Agent Logger logs\n${entry}/\n`
      : content + '\n# Agent Logger logs\n${entry}/\n';
    
    writeFileSync(gitignorePath, newContent, 'utf8');
    console.log(`[AgentLogger] Added log directory to .gitignore: ${entry}/`);
  } catch (error) {
    // Silently fail - .gitignore management is best-effort
    console.error('[AgentLogger] Failed to update .gitignore:', error);
  }
}

function findGitRoot(startPath: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: startPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}
