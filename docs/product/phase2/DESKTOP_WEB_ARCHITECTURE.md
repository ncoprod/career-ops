# Desktop/Web Architecture Decision

Date: 2026-04-09  
Decision: Adopt desktop-first shell with web stack and shared local services.

## Chosen Direction

1. UI: Web frontend (TypeScript) for rapid iteration and component testing.
2. Desktop packaging: Tauri shell for local-first distribution.
3. Local service layer: Node service boundary reusing current engine scripts/contracts.
4. Storage: local canonical store + export bridge to existing file contracts.

## Why This Choice

1. Lowest migration risk from current Node-based engine.
2. Strong desktop UX without forcing cloud auth complexity.
3. Reusable frontend surface for future hosted web mode.
4. Keeps local-first/privacy-friendly mode viable.

## High-Level Modules

1. `app-ui` (onboarding, editor, dashboard, suggestion center)
2. `app-state` (canonical entities and view state)
3. `app-services` (profile/offer/suggestion/export/provider APIs)
4. `engine-adapter` (bridges to existing repo scripts and templates)
5. `provider-router` (task-to-provider selection and fallback)

## Operational Constraints

1. Human-in-the-loop default for AI write actions.
2. No direct mutation of user facts from unapproved suggestions.
3. Export must remain compatible with existing pipeline tooling until full cutover.

## Deferred (out of Phase 3)

1. Mobile native client.
2. Full cloud multi-user sync.
3. Provider marketplace and advanced billing logic.

