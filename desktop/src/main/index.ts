import { app, BrowserWindow, dialog, shell, nativeImage } from "electron"
import path from "node:path"
import { registerIpcHandlers, setMainWindow } from "./ipc-handlers"
import { SkillsFileWatcher } from "./file-watcher"
import { closeDb } from "./db/index"
import { initAutoUpdater } from "./auto-updater"

let mainWindow: BrowserWindow | null = null
let fileWatcher: SkillsFileWatcher | null = null

function createWindow(): void {
  // Load app icon
  const iconPath = path.join(__dirname, "../../resources/icon.png")
  const icon = nativeImage.createFromPath(iconPath)

  // Set dock icon on macOS (needed for dev mode)
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(icon)
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Skillgate",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // ready-to-show can silently never fire if the renderer fails to load.
  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn("ready-to-show did not fire within 5s — forcing window visible")
      mainWindow.show()
    }
  }, 5000)

  mainWindow.on("ready-to-show", () => {
    clearTimeout(showTimeout)
    mainWindow?.show()
  })

  // Open external links in the default browser (only http/https)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL — ignore
    }
    return { action: "deny" }
  })

  // Prevent navigating the main window to external URLs
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedOrigins = [
      "file://",
      ...(process.env.ELECTRON_RENDERER_URL ? [process.env.ELECTRON_RENDERER_URL] : []),
    ]
    if (!allowedOrigins.some((origin) => url.startsWith(origin))) {
      event.preventDefault()
      try {
        const parsed = new URL(url)
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          shell.openExternal(url)
        }
      } catch {
        // Invalid URL — ignore
      }
    }
  })

  // Give the IPC handlers a reference to the window so rescanAndCache
  // can push skills:updated events to the renderer.
  setMainWindow(mainWindow)

  // Start the file watcher once the window is created
  fileWatcher = new SkillsFileWatcher(mainWindow)
  fileWatcher.start().catch((err) => {
    console.error("Failed to start file watcher:", err)
  })

  mainWindow.on("closed", () => {
    clearTimeout(showTimeout)
    fileWatcher?.stop()
    fileWatcher = null
    mainWindow = null
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"))
  }

  initAutoUpdater(mainWindow)
}

app.whenReady().then(() => {
  try {
    registerIpcHandlers()
  } catch (err) {
    // better-sqlite3 can fail to load (arch mismatch, missing prebuild,
    // sandbox restrictions). Show a dialog so the user knows why the app is broken.
    console.error("Failed to register IPC handlers:", err)
    dialog.showErrorBox(
      "Skillgate failed to start",
      "A required native module could not be loaded. Try reinstalling the app.\n\n" +
        String(err),
    )
  }

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("will-quit", () => {
  closeDb()
})
