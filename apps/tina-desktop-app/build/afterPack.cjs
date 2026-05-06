const path = require('node:path')
const fs = require('node:fs/promises')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  // electron-builder 的 signAndEditExecutable=true 会先解压 winCodeSign。
  // 在部分普通 Windows 开发环境里，那个步骤会因为无法创建 symlink 而失败。
  // 这里保留 signAndEditExecutable=false，只在 afterPack 阶段用 rcedit 写入 exe 图标，
  // 既避开 winCodeSign 权限问题，又能让安装后的主程序和快捷方式拿到应用图标。
  const { rcedit } = await import('rcedit')
  const productFilename =
    context.packager.appInfo.productFilename ||
    context.packager.appInfo.productName
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`)
  const iconPath = path.join(
    context.packager.projectDir,
    'public',
    'favicon.ico'
  )

  await fs.access(exePath)
  await fs.access(iconPath)

  await rcedit(exePath, {
    icon: iconPath,
  })

  console.log(`[afterPack] Windows exe icon updated: ${exePath}`)
}
