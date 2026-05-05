# Worktree Workbench

A desktop UI for managing **git worktrees** across multiple repositories at once. Built with Electron.

> Workspaces let you check out a feature branch across several repos simultaneously — frontend on `feat-x`, backend on `feat-x-api`, infra on `feat-x-deploy` — without disturbing the work in your main checkouts. Worktree Workbench gives you a single place to create those bundles, run tests, view diffs, and switch branches across them.

## Why

If you've ever:
- juggled three terminals to test a feature that spans multiple repos,
- lost track of which repos were on which branch,
- accidentally pushed work-in-progress because you forgot you'd switched branches in another window,

…this is for you. It treats a "feature workspace" as a first-class concept and gives you tools to operate on all its members together.

## Features

### Workspace management
- **Workspaces** group worktrees from multiple repos under one feature/branch name
- Create new workspaces with **Auto branch mode** — creates the branch if missing, checks it out if it exists, per repo
- **Import** existing worktrees you've already created via `git worktree add`
- **Archive** workspaces you're done with (hides without deleting); restore anytime
- **Drag-reorder** workspaces in the sidebar
- **Description, notes, and links** per workspace (paste design docs, ticket URLs, etc.)

### Per-worktree actions
- **Run any command** (test, lint, build, dev server, …) — auto-detected from `package.json`/`Cargo.toml`/`go.mod`/`pyproject.toml`, or configure your own
- **Watch mode** — re-run a command on file changes (debounced 500ms)
- **Branch switcher** — click the branch tag to switch or create a branch inline (with autocomplete)
- **Diff viewer** — colorized unified diff for the working tree
- **Commit + push** with one form
- **Stash / pop stash**, **fast-forward**, **fetch / pull / sync (fetch+rebase) / push**
- **Open in Finder, Terminal, or VS Code/Cursor** (uses `open -a` on macOS, no `code` PATH setup needed)
- **Copy** worktree path / branch name to clipboard

### Visual / UX
- Modern dark + light themes with **5 accent presets** (indigo, emerald, cyan, rose, amber)
- **Glass surfaces** on the sticky workspace header and modals
- **Neon glow** buttons in dark mode
- **Status indicators** — sidebar dot per workspace (clean / dirty / error / running) plus per-card dirty + ahead/behind badges
- **Compact mode** for dense displays of many repos
- **Resizable sidebar** — drag the right edge; double-click to reset
- **Reduced-motion** option (respects system preference too)
- **ANSI color** parsing in test output, with per-panel search/filter

### Productivity
- **Cmd+K command palette** — fuzzy-find any workspace, repo, command, or action
- **Keyboard shortcuts**: `Cmd+N` new, `Cmd+1..9` switch, `Cmd+\` toggle sidebar, `R` run all, `S` stop all, `?` help, `Esc` close
- **Native notifications** when long-running tests finish in the background
- **Auto-fetch** on app focus (rate-limited)
- **Run timer** per command, **re-run** button on the output panel

### Reliability
- **Atomic JSON writes** for settings and run history (no torn writes on crash)
- **Versioned schema migrations** (v1 → v2 → v3 already in place)
- **Transactional workspace creation** — if any worktree fails to create, all the ones already created are rolled back
- **IPC input validation** at every state-mutating handler
- **electron-log** for diagnostics
- **Sandboxed renderer** with strict CSP

## Requirements

- **Node.js** 18+ (uses ES modules, optional chaining, etc.)
- **git** 2.23+ (for `git switch`, modern worktree commands)
- **macOS, Linux, or Windows** (developed and tested primarily on macOS)

Optional:
- **VS Code** or **Cursor** — for the "open in editor" button (any one is enough; on macOS no PATH shim needed)

## Installation

Clone and install:

```bash
git clone <your-fork-url> workbench
cd workbench
npm install
```

Run the app:

```bash
npm start
```

## First-time setup

1. **Pick a workspaces directory** — Settings → Default workspaces directory. This is where new worktrees will be created (e.g. `~/worktrees`).
2. **Add your repos** — Manage repos → + Add repo. Point at any local git repository. The app auto-detects test/lint/build scripts from `package.json` if present.
3. **Create your first workspace** — `+ New`, give it a name like `feat-x`. Pick which repos to include. Auto branch mode will create or check out the branch in each.
4. **Or import existing worktrees** — `Import` lets you adopt worktrees you already created manually.

## Architecture

Modular by design — split by responsibility so each file is small and focused.

```
src/
  main.js                    # Electron bootstrap
  preload.js                 # contextBridge for renderer ↔ main IPC
  main/                      # Main process modules
    store.js                 # Versioned JSON persistence (atomic writes)
    git.js                   # All git operations (gitExec, status, diff, …)
    workspaces.js            # Create / import / delete / metadata logic
    testRunner.js            # Process spawn + buffered output + persistence
    watcher.js               # chokidar-based file watcher registry
    editor.js                # VS Code / Cursor launcher
    terminal.js              # OS terminal launcher
    ipc.js                   # IPC handler registration
    validate.js              # Lightweight schema validators
  renderer/
    index.html               # Layout + modals
    styles.css               # Design tokens + components
    renderer.js              # Bootstrap (imports & wires up modules)
    modules/                 # Feature modules (one concern each)
      state.js               # Shared state object
      utils.js               # $, escapeHtml
      refresh.js             # Reload-from-main and re-render
      sidebar.js             # Workspace list + drag-reorder
      sidebarStatus.js       # Per-workspace status dots
      workspaceView.js       # Active workspace pane
      memberCard.js          # Worktree cards with run buttons
      branchEditor.js        # Inline branch switch UI
      runs.js                # Run lifecycle, ANSI, timer, search
      statuses.js            # Dirty + ahead/behind status loading
      ansi.js                # Minimal SGR escape parser
      commandPalette.js      # Cmd+K fuzzy palette
      actionMenu.js          # Per-card ⋯ menu (commit / diff / stash …)
      diffModal.js           # Diff viewer
      commitModal.js         # Commit + push form
      keyboardShortcuts.js   # Global hotkeys
      keyboardHelp.js        # ? cheatsheet
      newWorkspaceModal.js   # Create flow
      importWorkspaceModal.js# Import flow
      manageReposModal.js    # Repo registry + commands editor
      metadataModal.js       # Description / notes / links
      settingsModal.js       # Workspaces dir / accent / motion
      bulkGitToast.js        # Per-member result toast for bulk ops
      notify.js              # Toast notifications (replaces alert)
      theme.js               # Light/dark/system cycle
      displayMode.js         # Compact + sidebar collapse + accent
      archivedToggle.js      # Show/hide archived workspaces
      resizer.js             # Sidebar drag-resize handle
      autoActions.js         # Watch trigger + auto-fetch on focus
```

### Persistence locations

- macOS: `~/Library/Application Support/worktree-workbench/`
- Linux: `~/.config/worktree-workbench/`
- Windows: `%APPDATA%\worktree-workbench\`

Files:
- `workbench.json` — settings, registered repos, workspaces, theme, prefs
- `runs.json` — last run output per worktree+command (capped 300KB per run)
- Logs (electron-log): `~/Library/Logs/Worktree Workbench/main.log` (macOS)

## Development

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the Electron app |
| `npm test` | Run vitest tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint on `src/` and `tests/` |
| `npm run format` | Run Prettier across the codebase |

### Pre-commit hook

`simple-git-hooks` runs `npm run lint && npm test` automatically before each commit. To install (once):

```bash
npx simple-git-hooks
```

### Testing

Tests live in `tests/`. They use [Vitest](https://vitest.dev/) and exercise the main-process modules against real temporary git repos:

- `tests/store.test.js` — atomic writes, migrations, corrupted-file recovery
- `tests/git.test.js` — gitExec, branches, status, worktree add/remove, switch, scan
- `tests/workspaces.test.js` — create with rollback, delete, metadata, reorder, import
- `tests/validate.test.js` — IPC schema validators

Helpers in `tests/helpers.js` create disposable git repos with `git init -b main` + an initial commit so tests are fully self-contained.

## Building installers

The project ships with an [electron-builder](https://www.electron.build/) config so you can produce signed-or-unsigned installers for macOS, Windows, and Linux.

### Quick commands

| Command | Output |
| --- | --- |
| `npm run pack` | Unpacked `.app` / executable in `dist/` (fastest, for testing) |
| `npm run dist:mac` | macOS `.dmg` (arm64 + x64) in `dist/` |
| `npm run dist:win` | Windows NSIS `.exe` installer |
| `npm run dist:linux` | Linux `.AppImage` and `.deb` |
| `npm run dist` | All targets for the current platform |

First build downloads ~100 MB of Electron binaries per architecture; subsequent builds are cached.

### macOS

The `build.afterPack` hook ad-hoc signs the `.app` automatically (using `codesign --sign -`), which is required for arm64 macs to launch unsigned binaries.

Output: `dist/Worktree Workbench-<version>-arm64.dmg` (~93 MB).

**On first launch**, macOS Gatekeeper will warn that the app isn't from an identified developer. Either:

```bash
# Strip the quarantine attribute applied by Safari/Mail downloads
xattr -dr com.apple.quarantine /Applications/Worktree\ Workbench.app
```

…or right-click the app in `/Applications` → **Open** → **Open** in the dialog.

For *real* distribution (no warnings), you'll need an Apple Developer account ($99/yr) and notarization. Set the env vars `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and remove `"identity": null` from the `build.mac` config in `package.json`. electron-builder handles the rest.

### Windows

```bash
npm run dist:win
```

Produces `dist/Worktree Workbench Setup-<version>.exe`. Without a code-signing certificate, SmartScreen will warn users on first run; they can click **More info** → **Run anyway**.

### Linux

```bash
npm run dist:linux
```

Produces `dist/Worktree Workbench-<version>.AppImage` and `dist/worktree-workbench_<version>_amd64.deb`. AppImage is portable; deb installs system-wide via `sudo dpkg -i`.

### Custom icon

Drop a square PNG (≥ 1024×1024) at `build/icon.png` and rebuild. electron-builder derives `.icns` and `.ico` automatically.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+N` | New workspace |
| `Cmd/Ctrl+1..9` | Switch to workspace by index |
| `Cmd/Ctrl+\` | Toggle sidebar |
| `R` | Run all (default command) |
| `S` | Stop all |
| `?` | Keyboard shortcut help |
| `Esc` | Close any open modal |

(`Cmd` on macOS, `Ctrl` on Windows/Linux.)

## Design choices

- **Workspaces own their worktrees.** Creating a workspace runs `git worktree add` for each member; deleting removes them. No orphan state.
- **Git is the source of truth.** The app caches state for instant render, but `git status` / `git symbolic-ref` are re-read on every status refresh. Manual `git switch` outside the app is detected next refresh.
- **Atomic writes** for all JSON persistence — write to `<file>.tmp.<pid>.<ts>` then rename.
- **Modular renderer.** Native ES modules with `<script type="module">`; no bundler. Each renderer module owns one concern.
- **Sandbox + contextIsolation** on the renderer. Strict CSP (`default-src 'self'; style-src 'self'; script-src 'self'`).

## Troubleshooting

**"VS Code button does nothing"** — On macOS, the app uses `open -a "Visual Studio Code"`. If that fails it falls back to Cursor, then to the `code` CLI. Make sure at least one is installed; nothing extra needed otherwise.

**"fatal: invalid reference"** when creating a workspace — set Branch handling to **Auto** (default) so missing branches are created automatically.

**Stuck workspace can't be deleted** — `Delete` first tries a clean removal; on failure it offers a force-remove that discards local changes in the worktrees. The underlying repos are never touched.

**App says nothing happened after I switched branches in a terminal** — click the ↻ refresh button in the workspace toolbar to re-poll. The app also auto-refreshes on window focus.

## License

MIT — see `LICENSE`.
