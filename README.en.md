# ccmm

[日本語](README.md) | **English**

**ccmm (Claude Code Memory Manager)** is a CLI tool for reusing and sharing Anthropic **Claude Code** configuration files `CLAUDE.md` across multiple projects.

---

## 0. Installation

```bash
npm install -g ccmm
```

or

```bash
npx ccmm
```

> **Requirements**  
> - Node.js 18+  
> - Git  
> - GitHub CLI (`gh`) * Generally required
> - Environment variable `GITHUB_TOKEN` * As needed

---

## 1. Setup

First, create a CLAUDE-md repository and push it to GitHub. (Private repositories are fine.)

The CLAUDE-md repository should have the following structure:
```
Write directory tree here
```
Reference: [Sample](https://github.com/Nasubikun/CLAUDE-md)

After preparing the CLAUDE-md repository:

```bash
cd YOUR_PROJECT/
ccmm init
```

1. Select the CLAUDE-md repository you want to reference (e.g., `myorg/CLAUDE-md`)  
2. One line will be automatically added to the end of `CLAUDE.md`

```diff
+ @~/.ccmm/projects/<hash>/merged-preset-HEAD.md
```

> Do not modify this line. Also, do not add anything below this line.

---

## 2. Fetch and sync presets

```bash
ccmm sync
```

- Downloads selected presets (e.g., `react.md`, `typescript.md`) to
  `$HOME/.ccmm/presets/...`  
- Automatically regenerates `merged-preset-HEAD.md` for Claude Code to read

---

## 3. Editing presets and upstream reflection

### 3-1. Direct preset editing

```bash
ccmm edit react.md     # Open preset file in editor
ccmm edit              # Run without arguments to show selection UI
```

You can directly edit existing preset files in an editor. Running without arguments allows interactive preset file selection.

### 3-2. Send changes to upstream repository

```bash
ccmm push react.md     # Send changes as GitHub PR
ccmm push              # Run without arguments to show selection UI
```

### 3-3. Extract changes from CLAUDE.md

```bash
git add CLAUDE.md      # Stage additions
ccmm extract          # Distribute changed lines to presets
```

You can move content written directly in CLAUDE.md to appropriate preset files.

---

## 4. Version locking

```bash
ccmm lock <commitSHA>
git commit -am "chore: lock CLAUDE presets @<SHA>"
```

- The import line will be replaced with `merged-preset-<SHA>.md`  

```bash
ccmm sync              # For locked projects, automatically reads fixed version
```

To unlock:

```bash
ccmm unlock            # Return to HEAD version
```

---

## 5. Command list

| Command | Description |
|---------|-------------|
| `ccmm init` | Initial setup (reference repository selection and CLAUDE.md configuration) |
| `ccmm sync` | Fetch presets and regenerate merged file |
| `ccmm edit [preset]` | Open preset file in editor (selection UI without arguments) |
| `ccmm extract` | Distribute CLAUDE.md changes to presets |
| `ccmm push [preset]` | Send preset changes via GitHub PR (selection UI without arguments) |
| `ccmm lock <sha>` | Lock preset to specific commit |
| `ccmm unlock` | Return to HEAD tracking mode |

---

## 7. Uninstall

```bash
npm rm -g ccmm
rm -rf ~/.ccmm        # Delete cache entirely (optional)
```

---

Happy Claude Coding 🚀