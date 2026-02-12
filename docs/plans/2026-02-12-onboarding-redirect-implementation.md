# Onboarding Redirect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce a hard onboarding gate so authenticated users without org membership are redirected to `/onboarding`, and successful onboarding lands on `/authenticated`.

**Architecture:** Move org-membership enforcement from client `useEffect` redirects into route loaders so redirects happen before protected content renders. Keep org state server-authoritative by querying Convex in loaders, and preserve `/dashboard` as the existing app surface behind a new `/authenticated` landing route alias.

**Tech Stack:** TanStack Start/Router loaders, WorkOS AuthKit (`getAuth`), Convex Query Client (`context.convexQueryClient`), Playwright smoke tests.

---

### Task 1: Lock In Redirect Behavior with Failing E2E Tests

**Files:**
- Modify: `e2e/smoke.spec.ts`

**Step 1: Write the failing test**

Add a new authenticated smoke test for the landing contract:

```ts
test('authenticated landing route resolves after onboarding', async ({ page }) => {
  await page.goto('/authenticated');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/\/(authenticated|dashboard|onboarding)/);
});
```

Then tighten existing onboarding success expectation from only `/dashboard` to the new canonical landing route behavior:

```ts
await page.waitForURL(/\/authenticated|\/dashboard/, { timeout: 10_000 });
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:e2e -- e2e/smoke.spec.ts -g "authenticated landing route resolves after onboarding"
```

Expected: FAIL because `/authenticated` route does not exist yet.

**Step 3: Commit test-only change**

```bash
git add e2e/smoke.spec.ts
git commit -m "test: add onboarding landing route expectations"
```

### Task 2: Add `/authenticated` Landing Route Alias

**Files:**
- Create: `src/routes/_authenticated/authenticated.tsx`

**Step 1: Write minimal implementation**

Create a route that redirects to the existing dashboard route:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/authenticated')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => null,
});
```

**Step 2: Run route generation + lint**

Run:

```bash
npm run lint
```

Expected: PASS; route types are regenerated and no lint/type issues.

**Step 3: Re-run targeted E2E test**

Run:

```bash
npm run test:e2e -- e2e/smoke.spec.ts -g "authenticated landing route resolves after onboarding"
```

Expected: PASS (with storage-state preconditions met).

**Step 4: Commit**

```bash
git add src/routes/_authenticated/authenticated.tsx src/routeTree.gen.ts
git commit -m "feat: add authenticated landing route alias"
```

### Task 3: Move Org Gate to `_authenticated` Loader

**Files:**
- Modify: `src/routes/_authenticated.tsx`

**Step 1: Write the failing assertion in existing E2E test**

Update logged-out protected-route test message and add an authenticated assertion path note so this test covers redirect destinations consistently:

```ts
const redirectOk = /workos\.com/.test(currentUrl) || /\/onboarding/.test(currentUrl) || /\/$/.test(currentUrl);
expect(redirectOk, `Unexpected protected-route redirect URL: ${currentUrl}`).toBe(true);
```

This should fail if loader logic is incomplete or returns an unexpected protected URL.

**Step 2: Implement loader-first gating**

In `src/routes/_authenticated.tsx`:

1. Keep existing auth check (`getAuth`, `getSignInUrl`).
2. Query org state in loader using Convex query client:

```ts
const hasOrg = await context.convexQueryClient.fetchQuery(api.orgs.get.hasOrg, {});
if (!hasOrg?.hasOrg) {
  throw redirect({ to: '/onboarding' });
}
```

3. Remove client-side `useNavigate` redirect `useEffect` for org gating.
4. Keep `syncCurrentUserFromWorkOS` side effect, but only for background consistency (no navigation in effect).

**Step 3: Run lint/typecheck**

Run:

```bash
npm run lint
```

Expected: PASS.

**Step 4: Run targeted E2E route test**

Run:

```bash
npm run test:e2e -- e2e/smoke.spec.ts -g "protected route redirects when logged out"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/_authenticated.tsx e2e/smoke.spec.ts
git commit -m "feat: enforce onboarding gate in authenticated loader"
```

### Task 4: Enforce Onboarding Route Redirect Rules and Post-Success Landing

**Files:**
- Modify: `src/routes/onboarding.tsx`

**Step 1: Write failing test expectation**

In onboarding smoke test, assert canonical success URL includes `/authenticated` behavior:

```ts
await page.waitForURL(/\/authenticated|\/dashboard/, { timeout: 10_000 });
```

Expected pre-change: may fail if only `/dashboard` is used.

**Step 2: Implement loader-level redirect rules**

In onboarding route loader:

1. Keep auth requirement.
2. Query `api.orgs.get.hasOrg` in loader using `context.convexQueryClient`.
3. If user already has org, redirect to `/authenticated`.

In component:

1. Remove render-time `navigate` call.
2. Keep loading/error states for create flow.
3. After successful create, navigate to `/authenticated` (replace current `/dashboard`).

**Step 3: Run lint + targeted onboarding smoke test**

Run:

```bash
npm run lint && npm run test:e2e -- e2e/smoke.spec.ts -g "organization onboarding \(if needed\)"
```

Expected: PASS (with storage-state preconditions met).

**Step 4: Commit**

```bash
git add src/routes/onboarding.tsx e2e/smoke.spec.ts
git commit -m "feat: harden onboarding redirects and canonical post-create landing"
```

### Task 5: Final Verification + Docs Sync

**Files:**
- Modify: `.planning/PROJECT.md`
- Modify: `docs/plans/2026-02-12-onboarding-redirect-design.md`

**Step 1: Run full verification commands**

Run:

```bash
npm run lint
npm run test:e2e -- e2e/smoke.spec.ts
```

Expected: PASS (or explicit skip messages for missing storage state files).

**Step 2: Update project tracking docs**

- Mark onboarding redirect blocker progress note in `.planning/PROJECT.md`.
- Add a short implementation note/status in `docs/plans/2026-02-12-onboarding-redirect-design.md`.

**Step 3: Commit docs + verification result**

```bash
git add .planning/PROJECT.md docs/plans/2026-02-12-onboarding-redirect-design.md
git commit -m "docs: record onboarding redirect implementation status"
```

## Implementation Notes

- If `context.convexQueryClient.fetchQuery(api.orgs.get.hasOrg, {})` is unavailable in loaders, use `ensureQueryData` with equivalent query options from Convex Query Client docs.
- Keep redirects done with `throw redirect(...)`, not imperative navigation, for deterministic pre-render behavior.
- Do not edit `src/routeTree.gen.ts` manually; let TanStack generate it.
- Maintain YAGNI: no new onboarding form fields beyond existing `name` and `billingEmail`.

## Quick Manual Smoke Checklist

1. Logged out user visiting `/dashboard` gets redirected to WorkOS sign-in.
2. Logged in user with no org is redirected from `/dashboard` to `/onboarding`.
3. Logged in user with org visiting `/onboarding` is redirected to `/authenticated` (then `/dashboard`).
4. Successful org creation redirects to `/authenticated` and app is usable.
