# Onboarding Redirect Design (v1 Ship Blocker)

Date: 2026-02-12
Status: Brainstormed and validated
Scope: Enforce org onboarding for authenticated users without org membership

## Goals

- Enforce a hard gate so authenticated users without org membership cannot access protected app routes.
- Route users without org membership to a dedicated onboarding flow.
- After successful onboarding, land users at `/authenticated`.
- Keep implementation simple, centralized, and low-risk for v1.

## Decisions Captured

- Redirect trigger: user has no org membership.
- Intercept behavior: hard redirect to `/onboarding` for protected routes.
- Post-onboarding destination: `/authenticated`.
- Architecture preference: centralized guard in `_authenticated` layout route.

## Approach Options

### A) Centralized guard in `_authenticated` + dedicated `/onboarding` (Recommended)

Add membership enforcement directly in `src/routes/_authenticated.tsx` loader after auth check. If user is signed in but has no org membership, redirect to `/onboarding`.

Create `/onboarding` as a standalone route (outside `_authenticated`) to ensure it is reachable for users who fail membership gating.

Pros:

- Single source of truth for protected route access.
- Minimal code duplication and lower maintenance burden.
- Easy to reason about and test.

Cons:

- Depends on reliable membership resolution at loader time.

### B) Per-route membership checks

Each protected route verifies membership independently.

Pros:

- Fine-grained exceptions possible.

Cons:

- Duplicated logic and higher chance of coverage gaps.

### C) Hybrid (loader guard + client fallback)

Keep centralized loader checks and add client-side backup guard.

Pros:

- Additional resilience in edge states.

Cons:

- More moving parts than needed for v1.

Recommendation: Approach A.

## Architecture and Route Behavior

### Protected layout (`/_authenticated`)

Loader flow should be:

1. Verify authentication (existing behavior).
2. Resolve current user's org membership.
3. If no membership, redirect to `/onboarding`.
4. If membership exists, allow route render.

This enforces onboarding consistently across all protected routes under the layout without adding checks to each route file.

### Onboarding route (`/onboarding`)

The onboarding route should remain reachable only for signed-in users who do not yet have org membership.

Route behavior:

- Signed in + no membership: show onboarding form.
- Signed in + has membership: redirect to `/authenticated`.
- Not signed in: run normal sign-in redirect flow.

### Loop prevention

- Users with membership cannot stay on `/onboarding`.
- Users without membership cannot access protected routes.
- Refreshing either route maintains the same deterministic gate behavior.

## Components and Data Flow

### UI composition

- Onboarding route loader: access gating and redirect decisions.
- Onboarding page container: request state and error state orchestration.
- Org creation form: required org name input with inline validation.
- Success handler: redirect to `/authenticated`.

### Provisioning sequence

1. User submits org creation form.
2. Server endpoint (Convex mutation/action + WorkOS integration) creates org in WorkOS.
3. Server syncs Convex org record with required defaults.
4. Server creates/ensures Admin membership for current user.
5. Client receives success and navigates to `/authenticated`.

### Safety constraints

- Disable submit while pending to prevent double-submit.
- Enforce idempotency by checking existing membership before new create.
- Membership remains server-authoritative and loader-enforced.

## Error Handling and Recovery

Classify failures into three categories:

1. Authorization/gating errors
2. Validation errors
3. Provisioning/sync errors

### Authorization and gating

Handled by route loaders only, not ad hoc UI logic.

### Validation

- Field-level errors for user-correctable input issues.
- Server-side validation is mandatory even if client validates first.

### Provisioning/sync failures

If WorkOS org creation succeeds but downstream sync fails, return a structured recoverable error and preserve enough metadata for support correlation (request id, user id, and candidate org id when available).

Retry behavior should reconcile existing resources first, not create another org blindly.

### Instrumentation

Track minimal onboarding events:

- `onboarding_viewed`
- `onboarding_submit_started`
- `onboarding_submit_succeeded`
- `onboarding_submit_failed` (with failure category)

## Testing Strategy

### Route guard tests

Cover these states:

- Unauthenticated user -> sign-in redirect.
- Authenticated user without membership -> redirect to `/onboarding`.
- Authenticated user with membership -> protected route allowed.

### Onboarding route tests

- No membership -> onboarding renders.
- Membership exists -> redirect to `/authenticated`.

### Provisioning flow tests

- Successful creation creates one org and one admin membership.
- Validation failure returns inline/displayable errors.
- Duplicate submits do not create duplicate orgs.
- Partial failure retry reconciles safely.

### Manual smoke checklist

1. Fresh signed-in user with no membership is forced to `/onboarding`.
2. Completing onboarding redirects to `/authenticated`.
3. Refreshing `/authenticated` remains allowed.
4. Visiting `/onboarding` after setup redirects away.
5. Simulated provisioning error presents retry and does not duplicate orgs.

## Rollout Notes

- Ship as a normal v1 blocker fix with centralized guard.
- Monitor onboarding success/failure event rates after release.
- If failures spike, temporary fallback is to relax membership gate while preserving auth gate.

## Ready for Implementation

This design is now validated and ready to convert into an implementation plan and code changes.
