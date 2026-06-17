import path from "node:path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"

const teamApiEntry = path.resolve(__dirname, "../cli/src/team-api/index.ts")

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "skillgate/team-api": teamApiEntry,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
})
