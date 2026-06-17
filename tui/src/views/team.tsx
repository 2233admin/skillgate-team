import { useState, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { useStore, useDispatch } from "../store/context.js"
import { useTeam } from "../data/use-team.js"
import { ConfirmDialog } from "../components/confirm-dialog.js"
import { colors } from "../utils/colors.js"

type PendingConfirm =
  | { type: "apply"; writeLock: boolean }
  | { type: "lock-write" }
  | null

/**
 * Team view: drift banner, context, profile picker, apply/doctor/lock verify.
 */
export function TeamView() {
  const state = useStore()
  const dispatch = useDispatch()
  const team = useTeam()

  const [profileIndex, setProfileIndex] = useState(0)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null)

  useEffect(() => {
    const idx = team.profiles.indexOf(team.selectedProfile)
    if (idx >= 0) setProfileIndex(idx)
  }, [team.profiles, team.selectedProfile])

  const selectedProfileName =
    team.profiles[profileIndex] ?? team.selectedProfile

  useKeyboard((key) => {
    if (state.activeView !== "team") return
    if (state.showHelp) return
    if (pendingConfirm) return
    if (team.actionLoading) return

    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      setProfileIndex((i) => Math.max(0, i - 1))
      const name = team.profiles[Math.max(0, profileIndex - 1)]
      if (name) team.selectProfile(name)
      return
    }

    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      const next = Math.min(team.profiles.length - 1, profileIndex + 1)
      setProfileIndex(next)
      const name = team.profiles[next]
      if (name) team.selectProfile(name)
      return
    }

    if (key.name === "r") {
      void team.refreshDrift(true)
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "info", message: "Refreshed catalog drift check" },
      })
      return
    }

    if (key.name === "a") {
      setPendingConfirm({ type: "apply", writeLock: false })
      return
    }

    if (key.name === "A" && key.shift) {
      setPendingConfirm({ type: "apply", writeLock: true })
      return
    }

    if (key.name === "d") {
      void runDoctor()
      return
    }

    if (key.name === "l") {
      void runLockVerify(false)
      return
    }

    if (key.name === "L" && key.shift) {
      setPendingConfirm({ type: "lock-write" })
      return
    }
  })

  async function runApply(writeLock: boolean) {
    const result = await team.apply({ writeLock })
    if (result.ok) {
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: {
          type: "success",
          message: `Applied profile ${result.data.profile}: ${result.data.installed} installs`,
        },
      })
      dispatch({ type: "REFRESH_SKILLS" })
    } else {
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "error", message: result.error.message },
      })
    }
  }

  async function runDoctor() {
    const result = await team.doctor()
    if (result.ok) {
      const count = result.data.drifts.length
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: {
          type: count === 0 ? "success" : "info",
          message: count === 0 ? "Doctor OK — no drift" : `Doctor found ${count} issue(s)`,
        },
      })
    } else {
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "error", message: result.error.message },
      })
    }
  }

  async function runLockVerify(write: boolean) {
    const result = await team.lockVerify(write)
    if (result.ok) {
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: {
          type: "success",
          message: write
            ? `Lock updated (${result.data.mismatches.length} entries)`
            : "Lock verify OK",
        },
      })
    } else {
      dispatch({
        type: "SHOW_NOTIFICATION",
        notification: { type: "error", message: result.error.message },
      })
    }
  }

  if (team.loading) {
    return (
      <box style={{ padding: 1 }}>
        <text fg={colors.textDim}>Loading team context…</text>
      </box>
    )
  }

  if (team.contextError) {
    return (
      <box style={{ flexDirection: "column", padding: 1 }}>
        <text fg={colors.error}>
          <strong>Team unavailable</strong>
        </text>
        <text fg={colors.text}>{team.contextError}</text>
        <text>{" "}</text>
        <text fg={colors.textDim}>
          Configure team.root in Settings (s) or set SKILLGATE_ROOT.
        </text>
        <text>{" "}</text>
        <text fg={colors.textDim}>
          1) git clone this repo  2) Settings → team.root  3) Tab 4 → a to apply
        </text>
      </box>
    )
  }

  const ctx = team.context!
  const summary = team.profileSummaries[selectedProfileName]

  const showOnboarding = !team.lastApply && !team.lastDoctor && !team.lastApplyResult

  return (
    <box style={{ flexDirection: "column", width: "100%", flexGrow: 1 }}>
      {showOnboarding ? (
        <box
          style={{
            width: "100%",
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 1,
            backgroundColor: colors.bgAlt,
          }}
        >
          <text fg={colors.primary}>
            <strong>Quick start</strong>
            {" "}
            <span fg={colors.textDim}>
              j/k pick profile → a apply → d doctor (? for all keys)
            </span>
          </text>
        </box>
      ) : null}

      {/* Drift banner */}
      {team.driftBehind ? (
        <box
          style={{
            width: "100%",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: "#332200",
          }}
        >
          <text fg={colors.warning}>
            <strong>Catalog behind</strong>
            {" "}
            {team.drift?.localVersion ?? "?"} → {team.drift?.remoteVersion ?? "?"}
            {"  "}(r refresh)
          </text>
        </box>
      ) : team.drift?.status === "throttled" ? (
        <box style={{ width: "100%", paddingLeft: 1 }}>
          <text fg={colors.textDim}>Drift check cached (r to force refresh)</text>
        </box>
      ) : null}

      {/* Context card */}
      <box
        style={{
          width: "100%",
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          flexDirection: "column",
          border: true,
          borderColor: colors.border,
        }}
      >
        <text fg={colors.primary}>
          <strong>Team Context</strong>
        </text>
        <text fg={colors.textDim}>Root: <span fg={colors.secondary}>{ctx.teamRoot}</span></text>
        <text fg={colors.textDim}>
          Linked project:{" "}
          <span fg={colors.secondary}>{ctx.linkedProject ?? "(none)"}</span>
        </text>
        <text fg={colors.textDim}>
          Profile source: <span fg={colors.secondary}>{ctx.profileSource}</span>
        </text>
      </box>

      {/* Profile picker */}
      <box style={{ flexDirection: "column", paddingLeft: 1, paddingTop: 1, flexGrow: 1 }}>
        <text fg={colors.primary}>
          <strong>Profiles</strong> <span fg={colors.textDim}>(j/k select)</span>
        </text>
        {team.profiles.length === 0 ? (
          <text fg={colors.textDim}>No profiles found</text>
        ) : (
          team.profiles.map((name, index) => {
            const info = team.profileSummaries[name]
            const isSelected = name === selectedProfileName
            return (
              <box
                key={name}
                style={{
                  width: "100%",
                  flexDirection: "row",
                  backgroundColor: isSelected ? colors.bgAlt : "transparent",
                }}
              >
                <text fg={isSelected ? colors.primary : colors.text}>
                  {isSelected ? "▸ " : "  "}{name}
                </text>
                {info ? (
                  <text fg={colors.textDim}>
                    {"  "}{info.skillCount} skills
                    {info.description ? ` — ${info.description}` : ""}
                  </text>
                ) : null}
              </box>
            )
          })
        )}

        {summary ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={colors.textDim}>
              Selected: {summary.name} ({summary.skillCount} skills)
            </text>
            {summary.agents?.length ? (
              <text fg={colors.textDim}>Agents: {summary.agents.join(", ")}</text>
            ) : null}
          </box>
        ) : null}

        {/* Last apply state */}
        {team.lastApply ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={colors.border}>---</text>
            <text fg={colors.textDim}>
              Last apply: {team.lastApply.appliedAt} — {team.lastApply.profile}
            </text>
            <text fg={colors.textDim}>
              Method: {team.lastApply.method}  Agents: {team.lastApply.agents.join(", ")}
            </text>
          </box>
        ) : null}

        {/* Action results */}
        {team.lastDoctor ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={team.lastDoctor.drifts.length ? colors.warning : colors.success}>
              Doctor: {team.lastDoctor.drifts.length === 0
                ? "OK"
                : `${team.lastDoctor.drifts.length} drift(s)`}
            </text>
            {team.lastDoctor.drifts.slice(0, 8).map((d) => (
              <text key={`${d.skill}-${d.agent ?? ""}-${d.kind}`} fg={colors.error}>
                {"  "}{d.skill}{d.agent ? `@${d.agent}` : ""}: {d.kind}
              </text>
            ))}
          </box>
        ) : null}

        {team.lastApplyResult ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={team.lastApplyResult.failed ? colors.warning : colors.success}>
              Apply: {team.lastApplyResult.installed} installs, {team.lastApplyResult.failed} failures
            </text>
            {team.lastApplyResult.results
              .filter((r) => !r.success)
              .slice(0, 5)
              .map((f) => (
              <text key={`${f.skill}-${f.agent ?? ""}`} fg={colors.error}>
                {"  "}{f.skill}{f.agent ? `@${f.agent}` : ""}: {f.error}
              </text>
            ))}
          </box>
        ) : null}

        {team.lastLockVerify && team.lastLockVerify.mismatches.length > 0 ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={colors.warning}>
              Lock: {team.lastLockVerify.mismatches.length} mismatch(es)
              {team.lastLockVerify.updated ? " (updated)" : ""}
            </text>
            {team.lastLockVerify.mismatches.slice(0, 5).map((m) => (
              <text key={m.skill} fg={colors.error}>
                {"  "}{m.skill}: {m.lockHash} != {m.diskHash}
              </text>
            ))}
          </box>
        ) : null}

        {team.actionLoading ? (
          <text fg={colors.textDim}>Running action…</text>
        ) : null}
      </box>

      <box style={{ paddingLeft: 1, paddingBottom: 1 }}>
        <text fg={colors.textDim}>
          a=apply  Shift+A=apply+write lock  d=doctor  l=lock verify  Shift+L=lock write  r=refresh drift
        </text>
      </box>

      {pendingConfirm?.type === "apply" ? (
        <ConfirmDialog
          message={
            pendingConfirm.writeLock
              ? `Apply profile "${selectedProfileName}" and update skills.lock.yaml?`
              : `Apply profile "${selectedProfileName}" to detected agents?`
          }
          onConfirm={() => {
            const writeLock = pendingConfirm.writeLock
            setPendingConfirm(null)
            void runApply(writeLock)
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}

      {pendingConfirm?.type === "lock-write" ? (
        <ConfirmDialog
          message="Update skills.lock.yaml hashes from disk content?"
          onConfirm={() => {
            setPendingConfirm(null)
            void runLockVerify(true)
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}
    </box>
  )
}