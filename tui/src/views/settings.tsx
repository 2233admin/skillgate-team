import { useState, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import { useStore, useDispatch } from "../store/context.js"
import { useDb } from "../db/context.js"
import { colors } from "../utils/colors.js"

interface SettingDef {
  key: string
  label: string
  type: "select" | "toggle" | "text"
  options?: string[]
  defaultValue: string | boolean
  placeholder?: string
}

const SETTING_DEFS: SettingDef[] = [
  {
    key: "team.root",
    label: "Team catalog root",
    type: "text",
    defaultValue: "",
    placeholder: "Override SKILLGATE_ROOT (optional)",
  },
  {
    key: "team.linkedProject",
    label: "Linked project path",
    type: "text",
    defaultValue: "",
    placeholder: "Project with .skillgate/profile",
  },
  {
    key: "install.scope",
    label: "Default install scope",
    type: "select",
    options: ["global", "project"],
    defaultValue: "global",
  },
  {
    key: "install.method",
    label: "Default install method",
    type: "select",
    options: ["symlink", "copy"],
    defaultValue: "symlink",
  },
  {
    key: "ui.theme",
    label: "Theme",
    type: "select",
    options: ["dark", "light", "system"],
    defaultValue: "dark",
  },
  {
    key: "telemetry.enabled",
    label: "Anonymous telemetry",
    type: "toggle",
    defaultValue: true,
  },
]

/**
 * Settings view: displays a list of key-value settings from SQLite.
 * Navigate with j/k, press Enter to toggle/cycle values or edit text.
 * Changes are saved immediately.
 */
export function SettingsView() {
  const state = useStore()
  const dispatch = useDispatch()
  const { settings } = useDb()

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [version, setVersion] = useState(0)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState("")

  const currentValues = SETTING_DEFS.map((def) => {
    const stored = settings.get(def.key, def.defaultValue)
    return stored
  })

  const handleToggle = useCallback((def: SettingDef, currentValue: unknown) => {
    if (def.type === "toggle") {
      const newVal = !currentValue
      settings.set(def.key, newVal)
      setVersion((v) => v + 1)
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "info", message: `${def.label}: ${newVal ? "enabled" : "disabled"}` },
      })
    } else if (def.type === "select" && def.options) {
      const currentStr = String(currentValue)
      const idx = def.options.indexOf(currentStr)
      const nextIdx = (idx + 1) % def.options.length
      const newVal = def.options[nextIdx]
      settings.set(def.key, newVal)
      setVersion((v) => v + 1)
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "info", message: `${def.label}: ${newVal}` },
      })
    }
  }, [settings, dispatch])

  const startTextEdit = useCallback((def: SettingDef, currentValue: unknown) => {
    setEditingKey(def.key)
    setDraftValue(String(currentValue ?? ""))
  }, [])

  useKeyboard((key) => {
    if (state.activeView !== "settings") return
    if (state.showHelp) return

    if (editingKey) {
      if (key.name === "escape") {
        setEditingKey(null)
      }
      return
    }

    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      setSelectedIndex((i) => Math.min(SETTING_DEFS.length - 1, i + 1))
    }

    if (key.name === "return") {
      const def = SETTING_DEFS[selectedIndex]
      if (def) {
        if (def.type === "text") {
          startTextEdit(def, currentValues[selectedIndex])
        } else {
          handleToggle(def, currentValues[selectedIndex])
        }
      }
    }
  })

  const editingDef = SETTING_DEFS.find((def) => def.key === editingKey)

  return (
    <box style={{ flexDirection: "column", width: "100%", flexGrow: 1 }}>
      <box
        style={{
          height: 1,
          width: "100%",
          paddingLeft: 1,
          backgroundColor: colors.bgAlt,
        }}
      >
        <text fg={colors.primary}>
          <strong>Settings</strong>
        </text>
      </box>

      {editingDef ? (
        <box
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.bg,
          }}
        >
          <box
            style={{
              width: 72,
              border: true,
              borderColor: colors.primary,
              backgroundColor: "#1a1a2e",
              flexDirection: "column",
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 1,
              paddingBottom: 1,
            }}
            title={editingDef.label}
          >
            <text fg={colors.textDim}>{editingDef.placeholder ?? "Enter value"}</text>
            <box
              style={{
                height: 3,
                width: "100%",
                border: true,
                borderColor: colors.primary,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <input
                placeholder={editingDef.placeholder ?? ""}
                focused={true}
                onInput={(value: string) => setDraftValue(value)}
                onSubmit={((value: string) => {
                  settings.set(editingDef.key, value.trim())
                  setVersion((v) => v + 1)
                  setEditingKey(null)
                  dispatch({
                    type: "SHOW_NOTIFICATION",
                    notification: {
                      type: "info",
                      message: `${editingDef.label} updated`,
                    },
                  })
                }) as any}
              />
            </box>
            <text fg={colors.textDim}>Enter=save  Esc=cancel</text>
          </box>
        </box>
      ) : null}

      <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}>
        {SETTING_DEFS.map((def, i) => {
          const val = currentValues[i]
          const isSelected = i === selectedIndex
          let displayValue: string

          if (def.type === "toggle") {
            displayValue = val ? "ON" : "OFF"
          } else if (def.type === "text") {
            displayValue = String(val || "(empty)")
          } else {
            displayValue = String(val)
          }

          const valueColor = def.type === "toggle"
            ? (val ? colors.success : colors.error)
            : colors.secondary

          return (
            <box
              key={def.key}
              style={{
                width: "100%",
                minHeight: 1,
                flexDirection: "row",
                paddingLeft: 1,
                backgroundColor: isSelected ? colors.bgAlt : "transparent",
              }}
            >
              <text fg={isSelected ? colors.primary : colors.text} style={{ width: 30 }}>
                {def.label}
              </text>
              <text fg={valueColor}>
                {"  "}{displayValue}
              </text>
              {isSelected && def.type === "select" ? (
                <text fg={colors.textDim}>
                  {"  "}(Enter to cycle: {def.options?.join(" > ")})
                </text>
              ) : null}
              {isSelected && def.type === "toggle" ? (
                <text fg={colors.textDim}>
                  {"  "}(Enter to toggle)
                </text>
              ) : null}
              {isSelected && def.type === "text" ? (
                <text fg={colors.textDim}>
                  {"  "}(Enter to edit)
                </text>
              ) : null}
            </box>
          )
        })}
      </box>

      <box style={{ paddingLeft: 2, paddingTop: 1 }}>
        <text fg={colors.textDim}>j/k=navigate  Enter=change  Esc=back</text>
      </box>
    </box>
  )
}