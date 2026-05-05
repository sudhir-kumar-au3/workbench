// electron-builder afterPack hook: ad-hoc codesigns the .app on macOS.
// arm64 macOS refuses to launch unsigned binaries; ad-hoc signing satisfies that
// without requiring an Apple Developer account. Users still see Gatekeeper prompts
// (right-click → Open the first time) until properly signed + notarized.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  // eslint-disable-next-line no-console
  console.log(`  • ad-hoc signing ${appPath}`);
  try {
    // Strip extended attributes that codesign rejects (DS_Store, finder info, etc.)
    execFileSync('xattr', ['-cr', appPath]);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`  • ad-hoc signing failed (app may not launch): ${e.message}`);
  }
};
