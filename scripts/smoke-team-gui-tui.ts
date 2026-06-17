/**
 * Simulates Desktop IPC + TUI Team tab workflows against real team-api.
 * Run: bun run scripts/smoke-team-gui-tui.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkCatalogDrift,
  getLastApplyState,
  getProfileSummary,
  listProfiles,
  resolveTeamContext,
  runApply,
  runDoctor,
  runLockVerify,
} from "../cli/src/team-api/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PROFILE = process.env.SMOKE_PROFILE ?? "quant";
const SKIP_APPLY = process.argv.includes("--skip-apply");

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  FAIL ${name} — ${detail}`);
}

async function simulateDesktopIpc() {
  console.log("\n=== Desktop IPC simulation (team-api) ===\n");

  const settings = {
    "team.root": REPO_ROOT,
    "team.lastProfile": PROFILE,
  };

  const ctxResult = await resolveTeamContext({ settings, profile: PROFILE });
  if (!ctxResult.ok) {
    fail("team:getContext", ctxResult.error.message);
    return;
  }
  pass("team:getContext", ctxResult.data.effectiveProfile);

  const profilesResult = await listProfiles(ctxResult.data);
  if (!profilesResult.ok) {
    fail("team:listProfiles", profilesResult.error.message);
    return;
  }
  pass("team:listProfiles", profilesResult.data.join(", "));

  const summaryResult = await getProfileSummary(ctxResult.data, PROFILE);
  if (!summaryResult.ok) {
    fail("team:getProfileSummary", summaryResult.error.message);
  } else {
    pass(
      "team:getProfileSummary",
      `${summaryResult.data.skillCount} skills`,
    );
  }

  const driftCached = await checkCatalogDrift(ctxResult.data, { force: false });
  if (!driftCached.ok) {
    fail("team:catalogDrift (cached)", driftCached.error.message);
  } else {
    pass(
      "team:catalogDrift (cached)",
      `status=${driftCached.data.status} fromCache=${driftCached.data.fromCache}`,
    );
  }

  const driftForce = await checkCatalogDrift(ctxResult.data, { force: true });
  if (!driftForce.ok) {
    fail("team:catalogDrift (force)", driftForce.error.message);
  } else {
    pass("team:catalogDrift (force)", `status=${driftForce.data.status}`);
  }

  const doctorResult = await runDoctor(ctxResult.data, { profile: PROFILE });
  if (!doctorResult.ok) {
    fail("team:doctor", doctorResult.error.message);
  } else {
    pass(
      "team:doctor",
      `ok=${doctorResult.data.ok} drifts=${doctorResult.data.drifts.length} agents=${doctorResult.data.agentCount}`,
    );
  }

  const lockResult = await runLockVerify(ctxResult.data, { write: false });
  if (!lockResult.ok) {
    fail("team:lockVerify", lockResult.error.message);
  } else {
    pass(
      "team:lockVerify",
      `ok=${lockResult.data.ok} mismatches=${lockResult.data.mismatchCount} updated=${lockResult.data.updated}`,
    );
  }

  if (!SKIP_APPLY) {
    const applyResult = await runApply(ctxResult.data, {
      profile: PROFILE,
      yes: true,
      dryRun: true,
    });
    if (!applyResult.ok) {
      fail("team:apply (dry-run)", applyResult.error.message);
    } else {
      const failed = applyResult.data.results.filter((r) => !r.success).length;
      pass(
        "team:apply (dry-run)",
        `profile=${applyResult.data.profile} failed=${failed}`,
      );
    }
  }

  const lastApply = await getLastApplyState();
  pass("team:getLastApplyState", lastApply ? "has state" : "empty");
}

async function simulateTuiHook() {
  console.log("\n=== TUI hook simulation (same team-api calls) ===\n");

  const settings = {
    "team.root": REPO_ROOT,
    "team.linkedProject": "",
    "team.lastProfile": PROFILE,
  };

  const ctxResult = await resolveTeamContext({ settings, profile: PROFILE });
  if (!ctxResult.ok) {
    fail("use-team: resolveContext", ctxResult.error.message);
    return;
  }
  pass("use-team: resolveContext");

  const driftResult = await checkCatalogDrift(ctxResult.data, { force: false });
  if (!driftResult.ok) {
    fail("useCatalogDriftBadge", driftResult.error.message);
  } else {
    const behind = driftResult.data.status === "behind";
    pass("useCatalogDriftBadge", `behind=${behind}`);
  }

  const refreshDrift = await checkCatalogDrift(ctxResult.data, { force: true });
  if (!refreshDrift.ok) {
    fail("refreshDrift (r key)", refreshDrift.error.message);
  } else {
    pass("refreshDrift (r key)", refreshDrift.data.status);
  }

  const doctor = await runDoctor(ctxResult.data);
  if (!doctor.ok) {
    fail("doctor (d key)", doctor.error.message);
  } else {
    pass("doctor (d key)", `ok=${doctor.data.ok} drifts=${doctor.data.drifts.length}`);
  }

  const lock = await runLockVerify(ctxResult.data, { write: false });
  if (!lock.ok) {
    fail("lockVerify (l key)", lock.error.message);
  } else {
    pass("lockVerify (l key)", `ok=${lock.data.ok} mismatches=${lock.data.mismatchCount}`);
  }

  if (!SKIP_APPLY) {
    const apply = await runApply(ctxResult.data, { yes: true, dryRun: true });
    if (!apply.ok) {
      fail("apply (a key)", apply.error.message);
    } else {
      pass("apply (a key)", `skills=${apply.data.results.length}`);
    }
  }
}

async function main() {
  console.log(`SMOKE team workflows @ ${REPO_ROOT}`);
  console.log(`profile=${PROFILE} skipApply=${SKIP_APPLY}`);

  process.env.SKILLGATE_ROOT = REPO_ROOT;

  await simulateDesktopIpc();
  await simulateTuiHook();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Summary ===\n");
  console.log(`passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.error("FAILED steps:");
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("TEAM WORKFLOW SMOKE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});