# Onboarding Redirect Design

## Validated Design Summary

- Enforce org-membership redirects in route loaders to prevent protected UI rendering before redirect decisions.
- Keep auth checks in loaders and use `throw redirect(...)` for deterministic navigation.
- Use `/authenticated` as canonical post-onboarding destination, with existing dashboard flow preserved behind the alias.

## Implementation Status

- Implemented in this branch: onboarding redirect blocker behavior is in place.
- Key route files changed: `src/routes/_authenticated.tsx`, `src/routes/onboarding.tsx`, `src/routes/_authenticated/authenticated.tsx`.
- Related generated and verification updates: `src/routeTree.gen.ts`, `e2e/smoke.spec.ts`.
