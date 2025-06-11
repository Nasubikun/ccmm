# CLI Module Analysis

## Overview
This document provides a detailed analysis of the CLI module implementation in the ccmm project, identifying common patterns, duplicated code, and opportunities for refactoring.

## 1. Common Patterns Identified

### 1.1 Error Handling Pattern
All CLI commands follow a consistent error handling pattern using the `Result<T, Error>` type:
```typescript
// Pattern repeated in all commands
export async function commandName(options: OptionsType): Promise<Result<ReturnType, Error>> {
  try {
    // Implementation
    return Ok(result);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### 1.2 Git Repository Validation
Most commands (sync, lock, unlock, push) perform the same Git repository validation:
```typescript
// Duplicated in sync.ts, lock.ts, unlock.ts, push.ts
const isGitResult = await isGitRepository(projectRoot);
if (!isGitResult.success || !isGitResult.data) {
  return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
}

const originResult = await getOriginUrl(projectRoot);
if (!originResult.success) {
  return Err(new Error(`originURLを取得できませんでした: ${originResult.error.message}`));
}
```

### 1.3 Project Path Generation
Several commands generate project paths using the same pattern:
```typescript
// Duplicated in sync.ts, lock.ts, unlock.ts
const pathsResult = generateProjectPaths(projectRoot, originResult.data, commit);
if (!pathsResult.success) {
  return Err(pathsResult.error);
}
const paths = pathsResult.data;
```

### 1.4 File Existence Check Pattern
Common pattern for checking file existence before operations:
```typescript
// Pattern seen in multiple files
const exists = await fileExists(filePath);
if (!exists) {
  // Handle non-existence
}
```

### 1.5 Config Loading Pattern
The config loading from init.js is imported and used similarly in multiple places:
```typescript
// Pattern in sync.ts, unlock.ts
const { loadConfig } = await import("./init.js");
const configResult = loadConfig();
if (configResult.success) {
  // Use config
}
```

## 2. Duplicated Code

### 2.1 CLI Error Display Functions
The index.ts file has three display functions that could be extracted:
```typescript
function showError(message: string, error?: Error): void
function showSuccess(message: string): void
function showInfo(message: string): void
```

### 2.2 Preset Path Building
Both edit.ts and push.ts have identical `buildPresetPath` functions:
```typescript
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}
```

### 2.3 Command Action Wrapper
All command actions in index.ts follow the same try-catch pattern with similar error handling.

## 3. Responsibilities That Should Be in Other Modules

### 3.1 Business Logic in CLI Handlers
Several CLI handlers contain business logic that should be extracted:

- **sync.ts**: Contains CLAUDE.md parsing logic that could be in a separate parser module
- **lock.ts**: Vendor directory management logic could be extracted
- **extract.ts**: Git diff parsing logic could be moved to the git module
- **push.ts**: GitHub workflow execution logic is quite complex and could be separated

### 3.2 File Path Operations
Many commands build paths manually instead of using a centralized path management module:
```typescript
// Examples of path building scattered across files
join(homeDir, ".ccmm", "presets", host, owner, repo, preset)
join(ccmmDir, "config.json")
join(projectRoot, 'CLAUDE.md')
```

## 4. Common Error Handling Patterns

### 4.1 Inconsistent Error Messages
Error messages are not standardized across commands:
- Some use Japanese, others use English
- Different formats for similar errors

### 4.2 Missing Error Context
Many errors don't provide enough context:
```typescript
// Current pattern
return Err(new Error("File not found"));

// Could be improved to
return Err(new Error(`Preset file not found: ${filePath}`));
```

## 5. Opportunities to Extract Shared Utilities

### 5.1 Git Operations Validator
Create a shared utility for Git repository validation:
```typescript
export async function validateGitRepository(projectRoot: string): Promise<Result<{ originUrl: string }, Error>> {
  const isGitResult = await isGitRepository(projectRoot);
  if (!isGitResult.success || !isGitResult.data) {
    return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
  }
  
  const originResult = await getOriginUrl(projectRoot);
  if (!originResult.success) {
    return Err(new Error(`originURLを取得できませんでした: ${originResult.error.message}`));
  }
  
  return Ok({ originUrl: originResult.data });
}
```

### 5.2 Path Manager
Create a centralized path management module:
```typescript
export class PathManager {
  static ccmmHome(): string {
    return expandTilde("~/.ccmm");
  }
  
  static presetsDir(): string {
    return join(this.ccmmHome(), "presets");
  }
  
  static projectsDir(): string {
    return join(this.ccmmHome(), "projects");
  }
  
  static configPath(): string {
    return join(this.ccmmHome(), "config.json");
  }
  
  static presetPath(host: string, owner: string, repo: string, file: string): string {
    return join(this.presetsDir(), host, owner, repo, file);
  }
  
  static claudeMdPath(projectRoot: string): string {
    return join(projectRoot, "CLAUDE.md");
  }
}
```

### 5.3 Config Manager
Extract config operations into a dedicated module:
```typescript
export class ConfigManager {
  private static configPath = PathManager.configPath();
  
  static async load(): Promise<Result<InitConfig, Error>> {
    // Centralized config loading
  }
  
  static async save(config: InitConfig): Promise<Result<void, Error>> {
    // Centralized config saving
  }
  
  static async getDefaultPresets(): Promise<PresetPointer[]> {
    // Extract preset configuration logic
  }
}
```

### 5.4 Preset File Manager
Consolidate preset file operations:
```typescript
export class PresetFileManager {
  static async fetchPresets(pointers: PresetPointer[]): Promise<Result<PresetInfo[], Error>> {
    // Unified preset fetching logic
  }
  
  static async ensurePresetFile(filePath: string): Promise<Result<void, Error>> {
    // Shared preset file creation logic
  }
}
```

## 6. Separation Between CLI Layer and Business Logic

### 6.1 Current Issues
- CLI handlers contain too much business logic
- Direct file system operations in CLI handlers
- Git operations mixed with CLI concerns

### 6.2 Recommended Structure
```
src/
  cli/              # Only CLI interface logic
    commands/       # Command handlers (thin layer)
    utils/          # CLI-specific utilities
  domain/           # Business logic
    preset/         # Preset management
    project/        # Project management
    sync/           # Sync operations
  infrastructure/   # External integrations
    git/            # Git operations
    github/         # GitHub API
    fs/             # File system
```

## 7. Inconsistencies in Command Structure

### 7.1 Return Type Inconsistencies
- Most commands return `Result<void, Error>`
- `init` returns a custom `InitResult` type
- `push` returns `Result<string, Error>`

### 7.2 Option Handling
- Some commands use specific option interfaces (SyncOptions, LockOptions)
- Others reuse generic interfaces (CliOptions)
- Inconsistent parameter validation

### 7.3 Async/Await Usage
- All commands are async but some operations could be synchronous
- Inconsistent use of Promise.all for parallel operations

## 8. Repeated Validation Logic

### 8.1 Parameter Validation
Each command validates its parameters differently:
```typescript
// edit.ts
if (!preset) {
  return Err(new Error("プリセット名を指定してください"));
}
if (!options.owner) {
  return Err(new Error("--owner オプションでリポジトリオーナーを指定してください"));
}

// push.ts - similar pattern
if (!preset) {
  return Err(new Error("プリセット名を指定してください"));
}
if (!options.owner) {
  return Err(new Error("--owner オプションでリポジトリオーナーを指定してください"));
}
```

### 8.2 Initialization Check
The `sync` command checks initialization but others don't:
```typescript
// Only in sync.ts
if (!isInitialized()) {
  return Err(new Error("ccmmが初期化されていません。先に 'ccmm init' を実行してください"));
}
```

## 9. Recommendations

### 9.1 Extract Common Utilities
1. Create a `cli-utils` module for shared CLI operations
2. Create a `validation` module for parameter validation
3. Create a `paths` module for path management
4. Create a `config` module for configuration management

### 9.2 Standardize Command Structure
1. Define a base command interface
2. Standardize return types
3. Create command factory or builder pattern

### 9.3 Improve Error Handling
1. Create custom error types for different scenarios
2. Standardize error messages (consider i18n)
3. Add error context and recovery suggestions

### 9.4 Separate Concerns
1. Move business logic out of CLI handlers
2. Create domain services for complex operations
3. Use dependency injection for better testability

### 9.5 Reduce Code Duplication
1. Extract shared validation logic
2. Consolidate path building operations
3. Unify config loading patterns

## 10. Example Refactoring

### Base Command Pattern
```typescript
interface CommandContext {
  projectRoot: string;
  paths: ProjectPaths;
  config: InitConfig;
  git: GitInfo;
}

abstract class BaseCommand<TOptions extends CliOptions, TResult> {
  protected abstract validateOptions(options: TOptions): Result<void, Error>;
  protected abstract execute(context: CommandContext, options: TOptions): Promise<Result<TResult, Error>>;
  
  async run(options: TOptions): Promise<Result<TResult, Error>> {
    // Common validation
    const validationResult = this.validateOptions(options);
    if (!validationResult.success) {
      return Err(validationResult.error);
    }
    
    // Common setup
    const contextResult = await this.setupContext();
    if (!contextResult.success) {
      return Err(contextResult.error);
    }
    
    // Execute command
    return this.execute(contextResult.data, options);
  }
  
  private async setupContext(): Promise<Result<CommandContext, Error>> {
    // Common setup logic
  }
}
```

This refactoring would significantly reduce code duplication and improve maintainability while keeping the CLI layer focused on its primary responsibility of handling command-line interactions.