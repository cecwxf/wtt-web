const fs = require('fs')
const fsp = require('fs/promises')

const originalRename = fsp.rename.bind(fsp)
const originalRenameSync = fs.renameSync.bind(fs)
const originalRenameCb = fs.rename.bind(fs)

async function renameWithFallback(oldPath, newPath) {
  try {
    return await originalRename(oldPath, newPath)
  } catch (error) {
    if (!error || error.code !== 'EXDEV') throw error
    await fsp.copyFile(oldPath, newPath)
    await fsp.unlink(oldPath)
  }
}

function renameCbWithFallback(oldPath, newPath, callback) {
  originalRenameCb(oldPath, newPath, async (error) => {
    if (!error) {
      callback(null)
      return
    }

    if (error.code !== 'EXDEV') {
      callback(error)
      return
    }

    try {
      await fsp.copyFile(oldPath, newPath)
      await fsp.unlink(oldPath)
      callback(null)
    } catch (copyError) {
      callback(copyError)
    }
  })
}

function renameSyncWithFallback(oldPath, newPath) {
  try {
    return originalRenameSync(oldPath, newPath)
  } catch (error) {
    if (!error || error.code !== 'EXDEV') throw error
    fs.copyFileSync(oldPath, newPath)
    fs.unlinkSync(oldPath)
  }
}

fsp.rename = renameWithFallback
fs.promises.rename = renameWithFallback
fs.rename = renameCbWithFallback
fs.renameSync = renameSyncWithFallback
