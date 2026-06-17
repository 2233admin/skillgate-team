import pc from "picocolors";
import {
  resolveTeamContext,
  runLockVerify as runLockVerifyApi,
} from "../team-api/index.js";

export async function runLockVerify(args: string[]): Promise<void> {
  const write = args.includes("--write");
  const ctxResult = await resolveTeamContext();

  if (!ctxResult.ok) {
    console.error(pc.red(ctxResult.error.message));
    process.exit(1);
  }

  const result = await runLockVerifyApi(ctxResult.data, { write });

  if (!result.ok) {
    console.error(pc.red(result.error.message));
    process.exit(1);
  }

  const { data } = result;

  for (const mismatch of data.mismatches) {
    console.error(
      pc.yellow(
        `${mismatch.skill}: lock ${mismatch.lockHash ?? "(empty)"} != disk ${mismatch.diskHash}`,
      ),
    );
  }

  if (write && data.updated) {
    console.log(pc.green(`Updated lock (${data.mismatchCount} entries).`));
    process.exit(0);
  }

  if (data.mismatchCount > 0) {
    console.error(
      pc.red(`${data.mismatchCount} hash mismatch(es). Run with --write to fix.`),
    );
    process.exit(1);
  }

  console.log(pc.green("Lock verify OK."));
}