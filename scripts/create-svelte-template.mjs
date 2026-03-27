#!/usr/bin/env node

import { access, cp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const SCOPE = '@tina-chris'
const TEMPLATE_FOLDER = 'example-svelte'
const VALID_FOLDER_NAME = /^[a-z0-9][a-z0-9-]*$/
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.svelte-kit'])

const currentFile = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(currentFile), '..')
const packagesDir = path.join(rootDir, 'packages')
const templateDir = path.join(packagesDir, TEMPLATE_FOLDER)

function assertFolderName(name) {
  if (!VALID_FOLDER_NAME.test(name)) {
    throw new Error(
      'Invalid folder name. Use lowercase letters, numbers, and hyphens only, and start with a letter or number.'
    )
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function promptFolderName() {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(
      'New package folder name (e.g. my-toolkit): '
    )
    return answer.trim()
  } finally {
    rl.close()
  }
}

async function createFromTemplate(folderName) {
  const targetDir = path.join(packagesDir, folderName)

  if (!(await pathExists(templateDir))) {
    throw new Error(`Template not found: ${templateDir}`)
  }

  if (await pathExists(targetDir)) {
    throw new Error(`Target folder already exists: ${targetDir}`)
  }

  await cp(templateDir, targetDir, {
    recursive: true,
    filter(sourcePath) {
      const baseName = path.basename(sourcePath)
      return !IGNORED_DIRS.has(baseName)
    },
  })

  const packageJsonPath = path.join(targetDir, 'package.json')
  const packageJsonRaw = await readFile(packageJsonPath, 'utf-8')
  const packageJson = JSON.parse(packageJsonRaw)

  packageJson.name = `${SCOPE}/${folderName}`

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf-8'
  )

  return {
    packageName: packageJson.name,
    targetDir,
  }
}

async function main() {
  const argFolderName = process.argv[2]?.trim()
  const folderName = argFolderName || (await promptFolderName())

  if (!folderName) {
    console.error('No folder name provided. Aborting.')
    process.exitCode = 1
    return
  }

  try {
    assertFolderName(folderName)
    const result = await createFromTemplate(folderName)

    output.write(`Created package from template: ${result.packageName}\n`)
    output.write(`Location: ${result.targetDir}\n`)
    output.write(`Next: pnpm -rF ${result.packageName} run dev\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
