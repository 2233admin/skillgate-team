import {
  resolveTeamContext,
  checkCatalogDrift,
} from "../team-api/index.js";

function parseArgs(args: string[]): { force: boolean } {
  return { force: args.includes("--force") };
}

export async function runUpdateCheck(args: string[]): Promise<void> {
  const { force } = parseArgs(args);
  const ctxResult = await resolveTeamContext();

  if (!ctxResult.ok) {
    return;
  }

  const result = await checkCatalogDrift(ctxResult.data, { force });

  if (!result.ok) {
    return;
  }

  const { data } = result;

  if (data.fromCache) {
    return;
  }

  if (data.status === "behind" && data.localVersion && data.remoteVersion) {
    console.log(`TEAM_CATALOG_UPGRADE ${data.localVersion} ${data.remoteVersion}`);
  }
}