import pc from "picocolors";
import {
  resolveTeamContext,
  runDoctor as runDoctorApi,
} from "../team-api/index.js";

interface DoctorCliOptions {
  profile?: string;
  quiet: boolean;
  json: boolean;
}

function parseDoctorOptions(args: string[]): DoctorCliOptions {
  const options: DoctorCliOptions = { quiet: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--profile" || arg === "-p") {
      options.profile = args[++i];
    } else if (arg === "-q" || arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
}

export async function runDoctor(args: string[]): Promise<void> {
  const options = parseDoctorOptions(args);
  const ctxResult = await resolveTeamContext({
    profile: options.profile,
    cwd: process.cwd(),
  });

  if (!ctxResult.ok) {
    if (options.quiet) {
      console.error(
        `SKILLGATE_TEAM_MISSING: ${ctxResult.error.message} (clone skillgate-team or set SKILLGATE_ROOT)`,
      );
    } else {
      console.error(pc.red(ctxResult.error.message));
    }
    process.exit(1);
  }

  const result = await runDoctorApi(ctxResult.data, {
    profile: options.profile,
  });

  if (!result.ok) {
    console.error(pc.red(result.error.message));
    process.exit(1);
  }

  const { data } = result;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: data.ok,
          profile: data.profile,
          drifts: data.drifts,
          agentCount: data.agentCount,
        },
        null,
        2,
      ),
    );
  } else if (!options.quiet) {
    console.log(pc.bold(`skillgate doctor - profile ${data.profile}`));
    console.log(pc.dim(`team root: ${data.teamRoot}`));
    console.log(pc.dim(`agents detected: ${data.agentCount}`));
    if (data.drifts.length === 0) {
      console.log(pc.green("OK - no drift detected."));
    } else {
      for (const d of data.drifts) {
        console.log(
          pc.red(
            `${d.skill}${d.agent ? `@${d.agent}` : ""}: ${d.kind}${d.expected ? ` (expected ${d.expected}, got ${d.actual ?? "n/a"})` : ""}`,
          ),
        );
      }
    }
  } else if (options.quiet && data.drifts.length > 0) {
    console.error(
      `SKILLGATE_DRIFT: ${data.drifts.length} issue(s) (run skillgate doctor --profile ${data.profile} for details)`,
    );
  }

  process.exit(data.ok ? 0 : 1);
}