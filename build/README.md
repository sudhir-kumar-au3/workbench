# Build resources

electron-builder picks up icons from this directory automatically.

To set a custom app icon, drop a single `icon.png` (≥ 1024×1024 PNG) here. electron-builder will derive `.icns` and `.ico` versions from it. If you have platform-native icons already, place them as:

- `icon.icns` — macOS (multi-resolution Apple icon)
- `icon.ico` — Windows (multi-resolution Windows icon)
- `icon.png` — Linux fallback (≥ 512×512)

If no icon files are present, the default Electron logo is used.

`background.png` (optional, 540×380) sets the DMG installer background.
