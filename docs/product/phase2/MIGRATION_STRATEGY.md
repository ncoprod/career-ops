# Migration Strategy - Repo Mode to App Mode

Version: 1.0  
Date: 2026-04-09

## Goal

Migrate from file-first operation to app-first workflows without breaking current users or scripts.

## Strategy

## Stage 0 - Compatibility Baseline

1. Freeze current file contracts with tests (`test-all.mjs`, `verify-pipeline.mjs`).
2. Use canonical model as internal representation only.

## Stage 1 - Import and Read Path

1. Import `cv.md`, `config/profile.yml`, `data/*` into canonical entities.
2. Keep file contracts as source of truth during initial onboarding.

## Stage 2 - Dual Write

1. UI writes canonical entities.
2. Export bridge writes repo-compatible artifacts (`reports/*`, `output/*`, `data/*`) deterministically.
3. Verify with `verify-pipeline.mjs` after export.

## Stage 3 - Compare and Stabilize

1. Diff app exports versus legacy outputs on fixture scenarios.
2. Block release if structural diffs break pipeline verification.

## Stage 4 - Controlled Cutover

1. App canonical store becomes primary.
2. Legacy files remain generated outputs for compatibility.
3. Keep rollback path by regenerating from canonical snapshots.

## Rollback Plan

1. Disable app write path.
2. Re-enable legacy script-first workflows.
3. Restore from last valid canonical export snapshot.

## Risks

1. Data drift between canonical store and legacy exports.
2. AI suggestion approval mismatches.
3. Lossy import on edge-case profile structures.

## Mitigations

1. Contract tests and fixture golden comparisons.
2. Deterministic serialization rules.
3. Event logging for every mutation and export operation.

