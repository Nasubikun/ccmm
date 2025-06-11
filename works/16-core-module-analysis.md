# Core Module Analysis

## Overview
The core module consists of three main components:
- `fs.ts` - File system operations
- `slug.ts` - Project identification via URL hashing
- `types/index.ts` - Type definitions for the entire project

## 1. File Responsibilities

### fs.ts
**Purpose**: Provides file system operations wrapped in Result types for safe error handling.

**Key Functions**:
- `readFile()` - Read file contents with Result wrapper
- `writeFile()` - Write file with automatic parent directory creation
- `ensureDir()` - Create directories recursively
- `expandTilde()` - Expand ~ to home directory path
- `resolvePath()` - Resolve paths to absolute paths with tilde expansion
- `fileExists()` - Check if file/directory exists
- `safeReadFile()` - Read file with existence check (returns null if not exists)

**Patterns Used**:
- All async operations return `Promise<Result<T, Error>>`
- Consistent error wrapping with `Error` instances
- Helper functions for common path operations

### slug.ts
**Purpose**: Generate unique project identifiers from Git repository URLs.

**Key Functions**:
- `makeSlug()` - Generate 16-character hash from Git origin URL
- `parseGitUrl()` - Extract host, owner, repo from various Git URL formats
- `sha256Short()` - Create SHA-256 hash truncated to 16 characters

**Patterns Used**:
- Pure functions with no side effects
- Throws errors for invalid URL formats (not using Result type)
- Supports multiple Git URL formats (HTTPS, SSH, SSH URL)

### types/index.ts
**Purpose**: Central type definitions for the entire project.

**Key Types**:
- `PresetPointer` - Points to preset files in GitHub repos
- `ProjectPaths` - Path information for project and presets
- `PresetImport` - Parsed preset import line
- `ClaudeMdContent` - Parsed CLAUDE.md file structure
- `ProjectInfo` - Complete project information
- Various CLI option interfaces
- `OperationResult<T>` - Type alias for `Result<T, Error>`

## 2. Code Duplication and Patterns

### Identified Duplications:
1. **Error Handling Pattern** - The try-catch pattern in fs.ts is repeated in every async function
2. **Path Operations** - Similar path handling logic could be consolidated
3. **File Existence Checks** - Both `fileExists()` and `dirExists()` use similar access() patterns

### Reusable Patterns:
1. **Result Wrapper for Async Operations**:
```typescript
// Current pattern repeated in fs.ts:
try {
  const result = await someAsyncOperation();
  return Ok(result);
} catch (error) {
  return Err(error instanceof Error ? error : new Error(String(error)));
}
```

2. **Error Conversion**:
```typescript
// Repeated error conversion pattern:
error instanceof Error ? error : new Error(String(error))
```

## 3. Module Boundaries

### Clear Boundaries:
- `fs.ts` - Only file system operations
- `slug.ts` - Only URL parsing and hashing
- `types/index.ts` - Only type definitions

### Potential Issues:
- `slug.ts` doesn't use Result type, throws errors directly (inconsistent with fs.ts)
- No shared utilities module for common patterns
- `tryCatch` from result.ts is defined but not used in core modules

## 4. Result Pattern Usage Analysis

### Good Usage:
- All fs.ts functions consistently return `Result<T, Error>`
- Clear success/failure paths
- Proper error wrapping

### Areas for Improvement:
1. **slug.ts** should use Result instead of throwing errors
2. **tryCatch** utility is available but not utilized
3. No use of Result composition functions (map, flatMap, etc.)

## 5. Potential Issues

1. **Inconsistent Error Handling**:
   - fs.ts uses Result pattern
   - slug.ts throws errors directly

2. **Missing Abstraction**:
   - Repeated try-catch blocks could use `tryCatch` utility
   - No wrapper for async Result operations

3. **Type Safety**:
   - `parseGitUrl` uses non-null assertions (!) which could be unsafe

4. **Test Coverage**:
   - fs.test.ts is comprehensive
   - slug.test.ts covers main cases but not all edge cases

## 6. Functions/Patterns for Shared Utilities

### Proposed Utility Functions:

1. **Async Result Wrapper**:
```typescript
export async function asyncResult<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    const result = await fn();
    return Ok(result);
  } catch (error) {
    return Err(toError(error));
  }
}
```

2. **Error Converter**:
```typescript
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
```

3. **Path Utilities**:
```typescript
export const pathUtils = {
  expandAndResolve: (path: string, base?: string) => 
    resolvePath(expandTilde(path), base),
  
  ensureParentDir: async (filePath: string) => 
    ensureDir(dirname(filePath))
};
```

4. **Result Async Utilities**:
```typescript
export const resultAsync = {
  map: <T, U>(fn: (value: T) => Promise<U>) => 
    async (result: Result<T, Error>): Promise<Result<U, Error>> => {
      if (!result.success) return result;
      return asyncResult(() => fn(result.data));
    },
    
  flatMap: <T, U>(fn: (value: T) => Promise<Result<U, Error>>) =>
    async (result: Result<T, Error>): Promise<Result<U, Error>> => {
      if (!result.success) return result;
      return fn(result.data);
    }
};
```

## 7. Recommendations

1. **Create a shared utilities module** (`src/core/utils.ts`) for common patterns
2. **Refactor slug.ts** to use Result pattern consistently
3. **Use tryCatch or asyncResult wrapper** to reduce boilerplate
4. **Consider creating a path utilities module** for path-related operations
5. **Add Result composition examples** in documentation or tests
6. **Standardize error handling** across all modules
7. **Create async-specific Result utilities** for better async operation handling

## Summary

The core module has clear responsibilities and good separation of concerns. The main areas for improvement are:
- Standardizing error handling (Result pattern everywhere)
- Extracting common patterns to utilities
- Better utilization of the Result pattern's functional capabilities
- Reducing code duplication through shared abstractions

The module provides a solid foundation but could benefit from more consistent patterns and better code reuse.