# App Stability & Routing Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate four critical UX regressions: excessive workspace-navigation calls, authenticated access to `/login`, white-screen reloads on `/app/:workspaceId/settings`, and broken DM deletion behavior, then ship a guarded quality pass for adjacent routing/state bugs.

**Architecture:** Consolidate auth/session and app bootstrap into a single protected-app gate mounted above all `/app/*` routes, introduce a public-only route guard for auth pages, and dedupe workspace/channel/message loading through a cache-aware loader path. Restore DM delete permissions at the database policy layer and harden active-DM delete navigation behavior in the sidebar. Add targeted regression tests around route guards, reload behavior, and DM deletion.

**Tech Stack:** React, TypeScript, React Router, Zustand, Supabase JS, Vitest, React Testing Library.

---

## Root-Cause Summary (from current code)

- `/login` remains accessible when authenticated because auth pages are plain routes with no public-only guard (`frontend/src/App.tsx`).
- Settings reload can render a permanent blank page because `WorkspaceSettings` depends on `workspaces` store data, but store hydration currently lives in `AppShell` only; `WorkspaceSettings` route does not mount `AppShell` and returns `null` when workspace data is missing (`frontend/src/pages/WorkspaceSettings.tsx`, `frontend/src/components/app-shell.tsx`, `frontend/src/hooks/use-app-data.ts`).
- Workspace navigation can trigger redundant calls due to duplicated load paths (`ensureDefaultWorkspaceAndChannel` + `fetchWorkspaces` + `fetchChannels` on bootstrap) and scattered fetch points across router entry points (`frontend/src/hooks/use-app-data.ts`, `frontend/src/lib/supabase-data.ts`, `frontend/src/pages/WorkspaceChannel.tsx`, `frontend/src/components/workspace-switcher.tsx`).
- DM deletion is broken for non-owner DM participants because migration `20260505123000_fix_workspace_channel_rls_owner_member.sql` reintroduced owner-only channel delete policy, overriding the earlier DM-member delete policy from `20260421130000_allow_dm_members_delete_dm_channels.sql`. Frontend active-channel delete fallback also only considers project channels, which is incorrect when deleting DMs (`frontend/src/components/channel-list.tsx`).

---

## File Structure

- Create `frontend/src/components/PublicOnlyRoute.tsx`
  - Redirect authenticated users away from `/login`, `/signup`, `/forgot-password` to `/app`.
- Create `frontend/src/components/ProtectedAppBootstrap.tsx`
  - Wrap protected app routes, run auth/session check + app data bootstrap once, render loading/error fallback safely.
- Modify `frontend/src/App.tsx`
  - Route regrouping so all `/app/*` routes share one bootstrap path.
  - Wrap auth pages with `PublicOnlyRoute`.
- Modify `frontend/src/components/ProtectedRoute.tsx`
  - Simplify to auth-only gate or merge responsibilities into `ProtectedAppBootstrap`.
- Modify `frontend/src/hooks/use-app-data.ts`
  - Remove duplicate bootstrap path (`ensureDefaultWorkspaceAndChannel` + repeat fetches) in favor of a single deterministic loader.
- Modify `frontend/src/lib/supabase-data.ts`
  - Add request-dedup helpers for workspace/channel/message fetches used during route transitions.
- Modify `frontend/src/pages/WorkspaceSettings.tsx`
  - Replace `return null` blank state with loading/error/redirect-safe fallback.
- Modify `frontend/src/pages/WorkspaceChannel.tsx`
  - Consume deduped loader APIs and avoid duplicate fetches during fast route changes.
- Create `supabase/migrations/20260509093000_restore_dm_member_delete_policy.sql`
  - Restore delete policy so DM participants can delete DMs while keeping project-channel deletion owner-only.
- Modify `frontend/src/components/channel-list.tsx`
  - Fix active-DM delete fallback navigation and improve failed-delete UX behavior.
- Create `frontend/src/components/route-guards.test.tsx`
  - Regression tests for authenticated `/login` redirect + unauthenticated protected-route redirect.
- Create `frontend/src/pages/workspace-settings-reload.test.tsx`
  - Regression test ensuring no blank screen on direct-load/reload of settings route.
- Create `frontend/src/hooks/use-app-data.test.ts`
  - Verify bootstrap call counts and dedup behavior.
- Create `frontend/src/components/channel-list.test.tsx`
  - Regression tests for DM deletion permission failure handling and active-DM fallback navigation.

---

### Task 1: Establish Repro Baseline and Guardrail Tests

**Files:**
- Create: `frontend/src/components/route-guards.test.tsx`
- Create: `frontend/src/pages/workspace-settings-reload.test.tsx`
- Create: `frontend/src/hooks/use-app-data.test.ts`

- [ ] **Step 1: Add route guard regression tests**
- [ ] **Step 2: Add settings direct-load test that currently fails (blank render path)**
- [ ] **Step 3: Add bootstrap call-count test proving duplicate fetch paths**
- [ ] **Step 4: Run targeted tests and record failing output**

Run:

```bash
cd frontend
npm run test -- route-guards workspace-settings-reload use-app-data
```

Expected: failures demonstrating current regressions.

- [ ] **Step 5: Commit failing-test baseline**

```bash
git add frontend/src/components/route-guards.test.tsx frontend/src/pages/workspace-settings-reload.test.tsx frontend/src/hooks/use-app-data.test.ts
git commit -m "test: add regression coverage for routing and bootstrap bugs"
```

---

### Task 2: Fix Auth Routing (Public-Only Auth Pages)

**Files:**
- Create: `frontend/src/components/PublicOnlyRoute.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Implement `PublicOnlyRoute` using Supabase session state**
- [ ] **Step 2: Wrap `/login`, `/signup`, `/forgot-password` routes with public-only guard**
- [ ] **Step 3: Preserve `state.from` behavior for post-login navigation on protected routes**
- [ ] **Step 4: Run route-guard tests**

Run:

```bash
cd frontend
npm run test -- route-guards
```

Expected: authenticated users hitting `/login` are redirected to `/app`.

- [ ] **Step 5: Commit auth-guard fix**

```bash
git add frontend/src/components/PublicOnlyRoute.tsx frontend/src/App.tsx
git commit -m "fix: redirect authenticated users away from auth pages"
```

---

### Task 3: Unify Protected-App Bootstrap Across `/app/*`

**Files:**
- Create: `frontend/src/components/ProtectedAppBootstrap.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/hooks/use-app-data.ts`
- Modify: `frontend/src/components/app-shell.tsx`

- [ ] **Step 1: Introduce `ProtectedAppBootstrap` that runs auth + data bootstrap before rendering child routes**
- [ ] **Step 2: Move bootstrap responsibility out of `AppShell` so settings/account routes get the same initialization**
- [ ] **Step 3: Ensure bootstrap executes once per session, with explicit loading and fatal-error UI**
- [ ] **Step 4: Remove duplicate initial-load sequence (`ensureDefaultWorkspaceAndChannel` then `fetchWorkspaces`/`fetchChannels`/`fetchMessages`) from `use-app-data`**
- [ ] **Step 5: Run hook and route tests**

Run:

```bash
cd frontend
npm run test -- use-app-data route-guards
```

Expected: single bootstrap path, no duplicate initial fetches in tests.

- [ ] **Step 6: Commit bootstrap consolidation**

```bash
git add frontend/src/components/ProtectedAppBootstrap.tsx frontend/src/App.tsx frontend/src/hooks/use-app-data.ts frontend/src/components/app-shell.tsx
git commit -m "refactor: unify protected app bootstrap for all app routes"
```

---

### Task 4: Eliminate Settings Reload White Screen

**Files:**
- Modify: `frontend/src/pages/WorkspaceSettings.tsx`
- Modify: `frontend/src/pages/workspace-settings-reload.test.tsx`

- [ ] **Step 1: Replace `return null` with explicit loading/skeleton state while workspace list hydrates**
- [ ] **Step 2: Add deterministic fallback when `workspaceId` is invalid (redirect to `/app`)**
- [ ] **Step 3: Prevent stale async updates during route changes/unmount**
- [ ] **Step 4: Re-run settings reload regression tests**

Run:

```bash
cd frontend
npm run test -- workspace-settings-reload
```

Expected: no blank render path on reload.

- [ ] **Step 5: Commit settings-route fix**

```bash
git add frontend/src/pages/WorkspaceSettings.tsx frontend/src/pages/workspace-settings-reload.test.tsx
git commit -m "fix: prevent blank screen on workspace settings reload"
```

---

### Task 5: Reduce Workspace Navigation Call Volume

**Files:**
- Modify: `frontend/src/lib/supabase-data.ts`
- Modify: `frontend/src/pages/WorkspaceChannel.tsx`
- Modify: `frontend/src/components/workspace-switcher.tsx`
- Modify: `frontend/src/hooks/use-app-data.test.ts`

- [ ] **Step 1: Add in-flight request dedup for workspace/channel/message reads during route transitions**
- [ ] **Step 2: Reuse cached channels/messages when switching within already-loaded workspaces**
- [ ] **Step 3: Ensure `WorkspaceChannel` avoids back-to-back `fetchChannels` + `fetchMessages` duplicates on fast navigation**
- [ ] **Step 4: Add/adjust call-count assertions in tests**
- [ ] **Step 5: Run targeted tests and local manual verification for workspace switching**

Run:

```bash
cd frontend
npm run test -- use-app-data
npm run dev
```

Manual check in browser:
- Switch across at least 3 workspaces repeatedly.
- Confirm no repeated bursts of identical network calls for the same workspace/channel.

- [ ] **Step 6: Commit call-volume reduction**

```bash
git add frontend/src/lib/supabase-data.ts frontend/src/pages/WorkspaceChannel.tsx frontend/src/components/workspace-switcher.tsx frontend/src/hooks/use-app-data.test.ts
git commit -m "perf: dedupe workspace navigation data fetches"
```

---

### Task 6: Quality Sweep for Adjacent Routing/State Bugs

**Files:**
- Modify: `frontend/src/pages/AccountSettings.tsx`
- Modify: `frontend/src/components/ProtectedRoute.tsx`
- Modify: `frontend/src/components/route-guards.test.tsx`
- Modify: `frontend/src/pages/workspace-settings-reload.test.tsx`

- [ ] **Step 1: Verify direct navigation to `/app/account` and `/app/:workspaceId/settings` after hard refresh**
- [ ] **Step 2: Standardize loading/error surfaces across protected routes**
- [ ] **Step 3: Add test coverage for invalid workspace/channel params and safe redirects**
- [ ] **Step 4: Run full frontend test suite**

Run:

```bash
cd frontend
npm run test
npm run build
```

Expected: tests pass and production build succeeds.

- [ ] **Step 5: Commit quality sweep**

```bash
git add frontend/src/pages/AccountSettings.tsx frontend/src/components/ProtectedRoute.tsx frontend/src/components/route-guards.test.tsx frontend/src/pages/workspace-settings-reload.test.tsx
git commit -m "chore: harden protected-route loading and invalid-route handling"
```

---

### Task 7: Restore DM Deletion End-to-End

**Files:**
- Create: `supabase/migrations/20260509093000_restore_dm_member_delete_policy.sql`
- Modify: `frontend/src/components/channel-list.tsx`
- Create: `frontend/src/components/channel-list.test.tsx`

- [ ] **Step 1: Add failing regression tests for DM deletion behavior**
- [ ] **Step 2: Add failing assertions for active-DM delete fallback when no project channels exist**
- [ ] **Step 3: Run tests to confirm current failure**

Run:

```bash
cd frontend
npm run test -- channel-list
```

Expected: failures showing DM delete behavior is not reliable.

- [ ] **Step 4: Add migration to restore DM-member delete policy**

Create `supabase/migrations/20260509093000_restore_dm_member_delete_policy.sql`:

```sql
-- Restore DM participant deletion rights while keeping project-channel deletion owner-only.

DROP POLICY IF EXISTS "Workspace owners can delete channels" ON public.channels;
DROP POLICY IF EXISTS "Users can delete channels" ON public.channels;

CREATE POLICY "Users can delete channels"
    ON public.channels FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.workspaces w
            WHERE w.id = channels.workspace_id
              AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
        )
        OR (
            channels.type = 'dm'
            AND channels.id IN (
                SELECT channel_id
                FROM public.channel_members
                WHERE user_id = auth.uid()
            )
        )
    );
```

- [ ] **Step 5: Harden frontend DM delete flow**
- [ ] **Step 6: Update active-channel fallback logic to prefer `general`, then any remaining project, then any remaining DM**
- [ ] **Step 7: Surface delete failures in UI (instead of console-only) while preserving optimistic rollback**

- [ ] **Step 8: Apply migration and verify delete permissions**

Run:

```bash
cd supabase
npx supabase db push
```

Expected: migration applies successfully.

- [ ] **Step 9: Re-run frontend DM deletion tests**

Run:

```bash
cd frontend
npm run test -- channel-list
```

Expected: DM delete regressions pass.

- [ ] **Step 10: Commit DM deletion fixes**

```bash
git add supabase/migrations/20260509093000_restore_dm_member_delete_policy.sql frontend/src/components/channel-list.tsx frontend/src/components/channel-list.test.tsx
git commit -m "fix: restore dm participant deletion and sidebar fallback behavior"
```

---

## Final Verification Checklist

- [ ] Authenticated user opening `/login` is redirected to `/app`.
- [ ] Hard refresh on `/app/<workspace-id>/settings` renders settings UI (never blank white screen).
- [ ] Repeated workspace switching does not trigger duplicate fetch bursts for the same data.
- [ ] DM participants (non-owners) can delete DM channels successfully.
- [ ] Deleting an active DM routes to a valid remaining channel without dead-end navigation.
- [ ] Core routing tests pass.
- [ ] Full frontend test suite and build pass.

## Rollout Notes

- Ship behind no feature flag (routing/data correctness fix).
- Monitor frontend error tracking for route-level crashes and rejected Supabase calls for 24 hours after deploy.
- If regressions appear, revert by commit boundary (tasks are intentionally isolated for rollback).
