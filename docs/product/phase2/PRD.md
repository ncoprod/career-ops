# PRD - Career-Ops MVP Desktop/Web

Version: 1.0  
Date: 2026-04-09  
Status: Approved for Phase 3 execution

## 1. Problem

The current system is powerful but file-first and operator-heavy. Non-technical users struggle to maintain profile data, review AI changes safely, and manage the full pipeline from one interface.

## 2. Product Goal

Ship a desktop/web MVP that allows users to complete core career workflows without manual file editing while preserving compatibility with the current engine.

## 3. Personas

1. Lightweight user: import CV, evaluate one offer, export CV, track status.
2. Power user: batch offers, compare variants, tune role targets.
3. Privacy-sensitive user: local-first preferences and transparent provider routing.

## 4. Non-Goals (Phase 3)

- No mobile app.
- No multi-tenant SaaS account system.
- No autonomous application submission.
- No replacement of current engine scripts.

## 5. MVP Scope

1. Onboarding flow (CV import, profile draft, clarifications).
2. Profile editor (experiences, projects, achievements, preferences, role targets).
3. Suggestion center (AI alternatives with approve/reject).
4. Offer evaluation UI (URL/text input, score breakdown, rationale, actions).
5. Dashboard (history, filters, statuses, generated assets).
6. Export bridge to current repo-compatible files during transition.

## 6. Success Criteria

1. User can finish onboarding without manual edits in `cv.md` or `profile.yml`.
2. User can evaluate an offer and get an explainable score.
3. User can approve/reject suggestions with clear provenance.
4. User can export artifacts that pass current pipeline integrity checks.
5. Main flow works in desktop/web shell with local persistence.

## 7. Functional Requirements

1. Fact-safe profile editing with explicit source/provenance.
2. Suggestion lifecycle: draft -> approved/rejected -> audit trail.
3. Provider routing transparency (provider id, mode, fallback reason).
4. Deterministic export to existing file contracts.
5. Pipeline event history for all significant state transitions.

## 8. Quality Requirements

1. Structured validation errors for all form writes.
2. Deterministic serialization for canonical objects.
3. Feature-level acceptance criteria mapped to test cases.
4. Security baseline: no secret leakage, no untrusted URL auto-navigation without guards.

## 9. Risks and Controls

1. Overwriting user facts with AI text: blocked by explicit approval model.
2. Provider lock-in: blocked by provider abstraction contract.
3. Migration regressions: blocked by dual-write/compare strategy before cutover.

