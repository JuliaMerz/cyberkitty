// npm 11 can skip Electron's own postinstall on a fresh install, which leaves
// the package without its binary. Fetch it here if it is missing, so
// `npm install` is enough on every platform.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const dir = path.join(__dirname, '..', 'node_modules', 'electron')
if (!fs.existsSync(dir)) process.exit(0)
const marker = path.join(dir, 'path.txt')
const ok = fs.existsSync(marker) && fs.existsSync(path.join(dir, 'dist', fs.readFileSync(marker, 'utf8').trim()))
if (ok) process.exit(0)
console.log('Downloading the Electron binary…')
const r = spawnSync(process.execPath, [path.join(dir, 'install.js')], { stdio: 'inherit' })
if (r.status !== 0) {
  console.error('Electron did not download. Try again, or set ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/ and rerun `node node_modules/electron/install.js`.')
  process.exit(r.status ?? 1)
}
