# Worktree Workbench

Desktop UI (Electron) for managing **git worktrees** across multiple repos at once. Group worktrees into **workspaces** so a feature branch lives in one place across frontend, backend, infra, etc.

## Install & run

```bash
git clone <your-fork-url> workbench
cd workbench
npm install
npm start
```

Requirements: Node.js 18+, git 2.23+, macOS / Linux / Windows. Optional: VS Code or Cursor (for the editor button).

## First-time setup

1. Settings → set a **workspaces directory** (e.g. `~/worktrees`)
2. Manage repos → add your local git repos
3. **+ New** to create a workspace, or **Import** to adopt existing worktrees

## Build installers

| Command | Output |
| --- | --- |
| `npm run pack` | Unpacked app in `dist/` |
| `npm run dist:mac` | `.dmg` (arm64 + x64), ad-hoc signed |
| `npm run dist:win` | NSIS `.exe` |
| `npm run dist:linux` | `.AppImage` + `.deb` |

macOS Gatekeeper on first launch: `xattr -dr com.apple.quarantine /Applications/Worktree\ Workbench.app` or right-click → **Open**. For notarized distribution, set `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` and remove `"identity": null` from `build.mac` in `package.json`.

Drop a `build/icon.png` (≥ 1024×1024) for a custom icon.

## Features

- **Workspaces** — bundle worktrees from multiple repos under one branch name; create, import, archive, reorder
- **Auto branch mode** — create the branch if missing, check it out if it exists, per repo
- **Per-worktree commands** — auto-detected from `package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml`, plus watch mode
- **Inline branch switcher** with autocomplete; **diff viewer**, **commit + push**, stash, fast-forward, fetch / pull / sync
- **Cmd+K palette** + keyboard shortcuts; native notifications; auto-fetch on focus
- Light/dark themes, 5 accent presets, compact mode, resizable sidebar, ANSI-colored output

## Development

| Command | What it does |
| --- | --- |
| `npm start` | Run the app |
| `npm test` | Vitest once |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

`simple-git-hooks` runs lint + tests pre-commit (`npx simple-git-hooks` once to install).

## Keyboard shortcuts

`Cmd/Ctrl+K` palette · `Cmd/Ctrl+N` new · `Cmd/Ctrl+1..9` switch · `Cmd/Ctrl+\` toggle sidebar · `R` run all · `S` stop all · `?` help · `Esc` close

## Architecture

- **Main** (`src/main/`): `store` (atomic JSON + migrations), `git`, `workspaces` (transactional with rollback), `testRunner`, `watcher`, `ipc`, `validate`
- **Renderer** (`src/renderer/modules/`): native ES modules, one concern each — sidebar, workspaceView, memberCard, runs, branchEditor, commandPalette, diffModal, etc.
- **Sandbox + contextIsolation** + strict CSP; IPC validated at every state-mutating handler

Persistence:

- macOS: `~/Library/Application Support/worktree-workbench/`
- Linux: `~/.config/worktree-workbench/`
- Windows: `%APPDATA%\worktree-workbench\`

## Troubleshooting

- **VS Code button does nothing** — uses `open -a "Visual Studio Code"` on macOS, falls back to Cursor, then `code` CLI
- **"fatal: invalid reference" on create** — set Branch handling to **Auto**
- **Stuck workspace** — Delete offers a force-remove on failure (only the worktrees, never the source repo)
- **State out of sync after a terminal `git switch`** — click ↻ in the workspace toolbar; app also auto-refreshes on focus

## License

MIT — see `LICENSE`.
