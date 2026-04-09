# Wireflow Map - MVP Desktop/Web

Version: 1.0  
Date: 2026-04-09

## Flow Overview

```mermaid
flowchart TD
  A["Launch App"] --> B["Onboarding"]
  B --> B1["Import CV"]
  B1 --> B2["Draft Profile"]
  B2 --> B3["Clarify Missing Facts"]
  B3 --> C["Dashboard Home"]

  C --> D["Offer Evaluation"]
  D --> D1["Paste URL or JD"]
  D1 --> D2["Score + Explainability"]
  D2 --> D3["Generate Suggestion Set"]
  D3 --> E["Suggestion Center"]

  C --> E
  E --> E1["Compare Alternatives"]
  E1 --> E2["Approve or Reject"]
  E2 --> C

  C --> F["Profile Editor"]
  F --> F1["Edit Facts"]
  F1 --> F2["Save Version"]
  F2 --> C

  C --> G["Export Bridge"]
  G --> G1["Write Repo-Compatible Artifacts"]
  G1 --> G2["Run Verify Pipeline"]
  G2 --> C
```

## Navigation States

1. `Onboarding`
2. `Dashboard`
3. `OfferReview`
4. `SuggestionCenter`
5. `ProfileEditor`
6. `AssetViewer`
7. `ExportAndValidation`

## State Transition Rules

1. Onboarding is mandatory until minimum profile completeness is reached.
2. Suggestions cannot mutate canonical facts directly; only approved actions can write.
3. Export action is blocked if model validation fails.
4. Offer review results must be persisted before user can create actions from them.
5. Every approve/reject action emits a pipeline event.

