# Canonical Data Model V1

Version: 1.0  
Date: 2026-04-09  
Status: Approved baseline

## Common Envelope (all entities)

Required fields:

- `entityType`
- `id`
- `version` (integer, starts at 1)
- `createdAt` (ISO-8601)
- `updatedAt` (ISO-8601)
- `provenance.sourceType` (`user`, `ai`, `import`, `system`)
- `provenance.sourceRef` (string)
- `provenance.actor` (string)
- `review.status` (`pending`, `approved`, `rejected`, `n/a`)
- `review.reviewedAt` + `review.reviewer` required when status is `approved` or `rejected`

## Entities

1. `UserProfile`
- `displayName`, `headline`, `summary`, `location`, `email`

2. `Experience`
- `profileId`, `company`, `role`, `startDate`, `endDate`, `highlights[]`

3. `Project`
- `profileId`, `name`, `description`, `impactSummary`

4. `Achievement`
- `profileId`, `title`, `metric`, `context`

5. `Skill`
- `profileId`, `name`, `category`, `level`

6. `Preference`
- `profileId`, `workMode`, `targetRegions[]`, `salaryMin`, `salaryMax`

7. `RoleTarget`
- `profileId`, `title`, `priority`, `keywords[]`

8. `Offer`
- `source`, `sourceUrl`, `company`, `role`, `rawText`, `capturedAt`

9. `OfferAnalysis`
- `offerId`, `overallScore`, `dimensionScores{}`, `recommendation`, `rationale`

10. `CVVariant`
- `offerId`, `profileId`, `contentMarkdown`, `exportPaths[]`

11. `Suggestion`
- `targetEntityId`, `targetField`, `currentValue`, `proposedValue`, `confidence`

12. `SuggestionDecision`
- `suggestionId`, `decision`, `decidedBy`, `decidedAt`, `reason`

13. `PipelineEvent`
- `eventType`, `entityRef`, `payload`, `occurredAt`

## Invariants

1. `id` is immutable.
2. `updatedAt` must be >= `createdAt`.
3. Every `SuggestionDecision` references an existing `Suggestion`.
4. `OfferAnalysis.offerId` must reference an existing `Offer`.
5. Exports must preserve compatibility with current `data/*`, `reports/*`, and `output/*` flows until full cutover.

## Machine Schema

See `schemas/canonical-model-v1.schema.json`.
