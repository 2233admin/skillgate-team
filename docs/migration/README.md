# Skillgate desktop migration

This directory is the executable contract for merging Agentdex capabilities into Skillgate and replacing the Electron desktop runtime with React + Tauri 2/Rust.

## Baselines

- Skillgate: `37b09a4`
- Agentdex: `7b9a541`
- Pake reference: `3.14.0` / Tauri 2

Skillgate remains the product, brand, repository, and compatibility authority. Agentdex supplies MIT-licensed capability references. Pake supplies desktop-shell and packaging conventions; Skillgate does not embed Pake business logic.

## M0 artifacts

- `agentdex-parity-ledger.md` — pinned Agentdex capability commitments.
- `skillgate-compatibility-ledger.md` — retained Skillgate commitments.
- `app-api-v1.md` — renderer/platform contract.
- `adr-002-team-ownership.md` — canonical Team behavior ownership.
- `adr-003-persistence-identity.md` — application identity and single-writer rules.
- `evidence.schema.json` — milestone evidence record contract.

## Status vocabulary

- `baseline-captured` — current behavior is recorded but target work is not complete.
- `in-progress` — target implementation exists but mandatory evidence is incomplete.
- `verified` — target implementation and all mandatory evidence pass.
- `secure-deviation` — behavior intentionally differs to close a documented security issue.
- `blocked` — a required external input or failed mandatory gate prevents completion.

Baseline evidence and migrated-target evidence are separate fields. A baseline capture can never close a commitment.

## Milestone rule

Every milestone writes evidence to `.omx/evidence/<milestone>/<run-id>/` with `summary.md` and `results.json`. A skipped mandatory check remains a release blocker. Module authors do not approve their own milestone.
