const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * Ky ad-hoc cho ban macOS.
 * Apple Silicon tu choi mo file thuc thi khong co chu ky va bao "app bi hong".
 * Chua co tai khoan Apple Developer thi van phai ky ad-hoc (chu ky "-"),
 * luc do may chi hoi "khong xac minh duoc nha phat trien" - mo bang chuot phai la duoc.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log(`ad-hoc signed ${appPath}`)
}
