# API and Service Contract Draft

Version: 0.9  
Date: 2026-04-09  
Status: Draft approved for Phase 3 implementation

## Runtime Boundary

Phase 3 uses an app shell over the current engine with a stable internal service API.

## Services

1. `ProfileService`
- `getProfile(profileId)`
- `saveProfile(profile)`
- `listExperiences(profileId)`

2. `OfferService`
- `createOfferFromUrl(url)`
- `createOfferFromText(rawText)`
- `analyzeOffer(offerId, mode)`

3. `SuggestionService`
- `listSuggestions(targetEntityId)`
- `createSuggestions(targetEntityId, fields[])`
- `decideSuggestion(suggestionId, decision, reason)`

4. `PipelineService`
- `listPipelineEvents(filters)`
- `updateApplicationStatus(applicationId, status)`

5. `ExportService`
- `exportRepoArtifacts(profileId, offerId, options)`
- `verifyExportIntegrity()`

6. `ProviderService`
- `listProviders()`
- `selectProvider(task, privacyMode)`
- `runTask(task, payload, providerSelection)`

## Provider Abstraction Contract

Provider descriptor:

```json
{
  "id": "openai",
  "kind": "managed",
  "available": true,
  "capabilities": {
    "rewrite": 5,
    "reasoning": 5,
    "structuredOutput": 5,
    "privacyLevel": 2
  }
}
```

Task routing output:

```json
{
  "primary": "openai",
  "fallbacks": ["anthropic", "local-ollama"],
  "reason": "quality-first for offer analysis"
}
```

Supported `privacyMode` values for `selectProvider(task, privacyMode)`:

1. `balanced` (default): quality-first routing with privacy level as a secondary score factor.
2. `privacy_preferred`: stronger weighting for higher privacy providers.
3. `high_privacy`: filters out low-privacy providers (level < 2), then ranks by quality + privacy.
4. `strict_local`: local providers only.

## Serialization Contract

1. Services exchange canonical model entities only.
2. Unknown fields are preserved but not required by validators.
3. Timestamp fields use ISO-8601 UTC strings with trailing `Z`.
4. `review.reviewedAt` and `review.reviewer` are required when `review.status` is `approved` or `rejected`; `review.reviewedAt` must be ISO-8601 UTC.
5. IDs remain stable across read/write cycles.

## Error Contract

All service errors:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "profileId is required",
  "details": [{"field": "profileId", "rule": "required"}]
}
```
