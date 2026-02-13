# OpenRouter Phase 2A: Model Routing and Chunking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CRM-aware AI chatbot that uses org data to produce sales-focused guidance, while routing each request to the right OpenRouter model and chunking CRM context into token-safe, high-signal payloads.

**Architecture:** Add a new `convex/crm/ai/` module with pure routing and chunking utilities, then layer CRM context assembly and an OpenRouter proxy action on top. Keep API keys server-side in Convex env vars, return grounded answers with citations, and expose a minimal authenticated Assistant page plus admin settings for model/chunk tuning.

**Tech Stack:** Convex (query/mutation/action/internalQuery), React 19, TanStack Router, TypeScript 5.9, shadcn/ui, Tailwind CSS v4, OpenRouter Chat Completions API.

**Skills:** @convex @tanstack @shadcn-ui @tailwind-v4 @test-driven-development @verification-before-completion

**Branch Policy:** Work directly on `main` (no worktrees), per repository policy.

---

### Task 1: Test Harness First (Routing + Chunking Contracts)

**Files:**
- Modify: `package.json`
- Create: `tests/ai/model-routing.test.ts`
- Create: `tests/ai/chunking.test.ts`

**Step 1: Add a dedicated AI test script**

Update `package.json` scripts:

```json
{
  "scripts": {
    "test:ai": "node --test --experimental-strip-types tests/ai/*.test.ts"
  }
}
```

**Step 2: Write failing routing tests before implementation**

Create `tests/ai/model-routing.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseModelRoute, detectSalesIntent } from '../../convex/crm/ai/routing';

test('detectSalesIntent identifies deal coaching intent', () => {
  const intent = detectSalesIntent('How do I unblock the Acme deal this week?');
  assert.equal(intent, 'deal_coaching');
});

test('chooseModelRoute selects reasoning model for high-complexity coaching', () => {
  const route = chooseModelRoute({
    userMessage: 'Build a win strategy for my top 5 stalled deals and draft next steps.',
    contextTokens: 4200,
    chunkCount: 5,
    modelConfig: {
      fastModel: 'openai/gpt-4.1-mini',
      reasoningModel: 'anthropic/claude-sonnet-4',
      fallbackModel: 'google/gemini-2.0-flash-001',
    },
  });

  assert.equal(route.tier, 'reasoning');
  assert.equal(route.model, 'anthropic/claude-sonnet-4');
});
```

**Step 3: Write failing chunking tests before implementation**

Create `tests/ai/chunking.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextChunks } from '../../convex/crm/ai/chunking';

test('buildContextChunks respects max token budget per chunk', () => {
  const chunks = buildContextChunks({
    snippets: [
      { id: 'deal:1', label: 'Deal A', body: 'A'.repeat(1200), score: 0.9 },
      { id: 'deal:2', label: 'Deal B', body: 'B'.repeat(1200), score: 0.8 },
      { id: 'activity:1', label: 'Call note', body: 'C'.repeat(1200), score: 0.7 },
    ],
    maxChunkTokens: 500,
    maxChunks: 4,
  });

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.estimatedTokens <= 500));
});
```

**Step 4: Run tests to confirm RED state**

Run:

```bash
npm run test:ai
```

Expected: FAIL with module-not-found errors for `convex/crm/ai/routing` and `convex/crm/ai/chunking`.

**Step 5: Commit red tests**

```bash
git add package.json tests/ai/model-routing.test.ts tests/ai/chunking.test.ts
git commit -m "test(ai): add failing contracts for model routing and chunking"
```

---

### Task 2: Add AI Configuration Persistence and Environment Defaults

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/crm/ai/config.ts`
- Modify: `.env.local.example`

**Step 1: Add `aiConfigs` table to schema**

Insert into `convex/schema.ts`:

```typescript
  aiConfigs: defineTable({
    orgId: v.id('orgs'),
    enabled: v.boolean(),
    fastModel: v.string(),
    reasoningModel: v.string(),
    fallbackModel: v.string(),
    maxChunkTokens: v.number(),
    maxChunks: v.number(),
    maxContextTokens: v.number(),
    temperature: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['orgId']),
```

**Step 2: Implement org-scoped AI config query/mutation**

Create `convex/crm/ai/config.ts` with:

```typescript
import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../../_generated/server';
import { requireCrmUser } from '../authz';

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const getAiConfig = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    const stored = await ctx.db.query('aiConfigs').withIndex('by_org', (q) => q.eq('orgId', orgId)).first();
    if (stored) return stored;
    return {
      orgId,
      enabled: true,
      fastModel: envOrDefault('OPENROUTER_FAST_MODEL', 'openai/gpt-4.1-mini'),
      reasoningModel: envOrDefault('OPENROUTER_REASONING_MODEL', 'anthropic/claude-sonnet-4'),
      fallbackModel: envOrDefault('OPENROUTER_FALLBACK_MODEL', 'google/gemini-2.0-flash-001'),
      maxChunkTokens: Number(process.env.OPENROUTER_MAX_CHUNK_TOKENS || 1000),
      maxChunks: Number(process.env.OPENROUTER_MAX_CHUNKS || 6),
      maxContextTokens: Number(process.env.OPENROUTER_MAX_CONTEXT_TOKENS || 6000),
      temperature: Number(process.env.OPENROUTER_TEMPERATURE || 0.2),
      updatedAt: Date.now(),
    };
  },
});

export const upsertAiConfig = mutation({
  args: {
    enabled: v.boolean(),
    fastModel: v.string(),
    reasoningModel: v.string(),
    fallbackModel: v.string(),
    maxChunkTokens: v.number(),
    maxChunks: v.number(),
    maxContextTokens: v.number(),
    temperature: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    if (role !== 'admin') throw new ConvexError('Admin role required');
    const now = Date.now();
    const existing = await ctx.db.query('aiConfigs').withIndex('by_org', (q) => q.eq('orgId', orgId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert('aiConfigs', { orgId, ...args, updatedAt: now });
  },
});
```

**Step 3: Document OpenRouter env vars**

Add to `.env.local.example` (Convex Dashboard variables section):

```bash
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_FAST_MODEL=openai/gpt-4.1-mini
# OPENROUTER_REASONING_MODEL=anthropic/claude-sonnet-4
# OPENROUTER_FALLBACK_MODEL=google/gemini-2.0-flash-001
# OPENROUTER_MAX_CHUNK_TOKENS=1000
# OPENROUTER_MAX_CHUNKS=6
# OPENROUTER_MAX_CONTEXT_TOKENS=6000
# OPENROUTER_TEMPERATURE=0.2
```

**Step 4: Verify schema + types**

Run:

```bash
npx convex dev
npm run lint
```

Expected: Convex schema deploy succeeds; TypeScript compiles.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/crm/ai/config.ts .env.local.example
git commit -m "feat(ai): add org-level ai config and openrouter env defaults"
```

---

### Task 3: Implement Model Routing Logic (Green Tests)

**Files:**
- Create: `convex/crm/ai/routing.ts`
- Modify: `tests/ai/model-routing.test.ts`

**Step 1: Implement intent detection + tier routing**

Create `convex/crm/ai/routing.ts`:

```typescript
export type SalesIntent = 'deal_coaching' | 'email_drafting' | 'pipeline_summary' | 'general_qa';
export type RouteTier = 'fast' | 'reasoning' | 'fallback';

type ModelConfig = {
  fastModel: string;
  reasoningModel: string;
  fallbackModel: string;
};

export function detectSalesIntent(message: string): SalesIntent {
  const input = message.toLowerCase();
  if (input.includes('draft') || input.includes('email')) return 'email_drafting';
  if (input.includes('pipeline') || input.includes('forecast')) return 'pipeline_summary';
  if (input.includes('win') || input.includes('objection') || input.includes('deal')) return 'deal_coaching';
  return 'general_qa';
}

export function chooseModelRoute(input: {
  userMessage: string;
  contextTokens: number;
  chunkCount: number;
  modelConfig: ModelConfig;
}) {
  const intent = detectSalesIntent(input.userMessage);
  const highComplexity = input.contextTokens > 2500 || input.chunkCount >= 4 || intent === 'deal_coaching';

  if (highComplexity) {
    return { tier: 'reasoning' as RouteTier, model: input.modelConfig.reasoningModel, intent };
  }
  return { tier: 'fast' as RouteTier, model: input.modelConfig.fastModel, intent };
}
```

**Step 2: Expand tests to cover fast route**

Add one more test in `tests/ai/model-routing.test.ts` asserting a short question routes to `fastModel`.

**Step 3: Run routing tests**

Run:

```bash
npm run test:ai -- tests/ai/model-routing.test.ts
```

Expected: PASS for all routing tests.

**Step 4: Commit**

```bash
git add convex/crm/ai/routing.ts tests/ai/model-routing.test.ts
git commit -m "feat(ai): implement sales-intent model routing"
```

---

### Task 4: Implement CRM Context Ranking and Chunking (Green Tests)

**Files:**
- Create: `convex/crm/ai/chunking.ts`
- Create: `convex/crm/ai/context.ts`
- Modify: `tests/ai/chunking.test.ts`

**Step 1: Implement deterministic chunk builder**

Create `convex/crm/ai/chunking.ts`:

```typescript
export type ContextSnippet = { id: string; label: string; body: string; score: number };
export type ContextChunk = { index: number; estimatedTokens: number; text: string; snippetIds: string[] };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildContextChunks(input: {
  snippets: ContextSnippet[];
  maxChunkTokens: number;
  maxChunks: number;
}): ContextChunk[] {
  const sorted = [...input.snippets].sort((a, b) => b.score - a.score);
  const chunks: ContextChunk[] = [];
  let current: ContextSnippet[] = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.map((s) => `[${s.id}] ${s.label}\n${s.body}`).join('\n\n');
    chunks.push({
      index: chunks.length,
      estimatedTokens: estimateTokens(text),
      text,
      snippetIds: current.map((s) => s.id),
    });
    current = [];
  };

  for (const snippet of sorted) {
    const draft = [...current, snippet];
    const text = draft.map((s) => `[${s.id}] ${s.label}\n${s.body}`).join('\n\n');
    if (estimateTokens(text) > input.maxChunkTokens && current.length > 0) flush();
    current.push(snippet);
    if (chunks.length >= input.maxChunks) break;
  }
  flush();
  return chunks.slice(0, input.maxChunks);
}
```

**Step 2: Add CRM snippet assembly query**

Create `convex/crm/ai/context.ts` with a query that reads org-scoped deals/contacts/companies/activities, scores snippets by keyword overlap, and returns top snippets:

```typescript
import { v } from 'convex/values';
import { query } from '../../_generated/server';
import { requireCrmUser } from '../authz';

function overlapScore(needle: string, haystack: string): number {
  const terms = needle.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0) / Math.max(terms.length, 1);
}

export const buildCrmSnippets = query({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const [deals, contacts, companies, activities] = await Promise.all([
      ctx.db.query('deals').withIndex('by_org', (q) => q.eq('orgId', orgId)).take(200),
      ctx.db.query('contacts').withIndex('by_org', (q) => q.eq('orgId', orgId)).take(200),
      ctx.db.query('companies').withIndex('by_org', (q) => q.eq('orgId', orgId)).take(200),
      ctx.db.query('activities').withIndex('by_org', (q) => q.eq('orgId', orgId)).take(300),
    ]);

    const snippets = [
      ...deals.map((d) => ({ id: `deal:${d._id}`, label: d.title, body: `${d.status} ${d.notes ?? ''}` })),
      ...contacts.map((c) => ({
        id: `contact:${c._id}`,
        label: `${c.firstName} ${c.lastName ?? ''}`.trim(),
        body: `${c.title ?? ''} ${c.email ?? ''}`,
      })),
      ...companies.map((c) => ({ id: `company:${c._id}`, label: c.name, body: `${c.industry ?? ''} ${c.notes ?? ''}` })),
      ...activities.map((a) => ({ id: `activity:${a._id}`, label: a.title, body: `${a.type} ${a.body ?? ''}` })),
    ]
      .map((snippet) => ({ ...snippet, score: overlapScore(args.prompt, `${snippet.label} ${snippet.body}`) }))
      .filter((snippet) => snippet.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80);

    return snippets;
  },
});
```

**Step 3: Run chunking tests**

Run:

```bash
npm run test:ai -- tests/ai/chunking.test.ts
```

Expected: PASS for chunk size and chunk count constraints.

**Step 4: Commit**

```bash
git add convex/crm/ai/chunking.ts convex/crm/ai/context.ts tests/ai/chunking.test.ts
git commit -m "feat(ai): add crm snippet scoring and token-aware chunking"
```

---

### Task 5: Implement OpenRouter Proxy Action with Fallback and Citations

**Files:**
- Create: `convex/crm/ai/chat.ts`

**Step 1: Implement OpenRouter call helper in action**

Inside `convex/crm/ai/chat.ts`, add:

```typescript
'use node';

import { ConvexError, v } from 'convex/values';
import { action } from '../../_generated/server';
import { api } from '../../_generated/api';
import { buildContextChunks, estimateTokens } from './chunking';
import { chooseModelRoute } from './routing';

async function callOpenRouter(model: string, messages: Array<{ role: 'system' | 'user'; content: string }>, temperature: number) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ConvexError('OPENROUTER_API_KEY is not configured');

  const res = await fetch(`${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature }),
  });

  if (!res.ok) throw new ConvexError(`OpenRouter call failed with ${res.status}`);
  const payload = await res.json();
  return payload.choices?.[0]?.message?.content ?? '';
}
```

**Step 2: Add main chat action with dry-run support**

Continue in `convex/crm/ai/chat.ts`:

```typescript
export const askSalesAssistant = action({
  args: {
    prompt: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    answer: v.string(),
    citations: v.array(v.string()),
    modelUsed: v.string(),
    routeTier: v.string(),
  }),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(api.crm.ai.config.getAiConfig, {});
    if (!config.enabled) throw new ConvexError('AI assistant is disabled for this org');

    const snippets = await ctx.runQuery(api.crm.ai.context.buildCrmSnippets, { prompt: args.prompt });
    const chunks = buildContextChunks({
      snippets,
      maxChunkTokens: config.maxChunkTokens,
      maxChunks: config.maxChunks,
    });
    const contextText = chunks.map((c) => c.text).join('\n\n---\n\n');
    const route = chooseModelRoute({
      userMessage: args.prompt,
      contextTokens: estimateTokens(contextText),
      chunkCount: chunks.length,
      modelConfig: {
        fastModel: config.fastModel,
        reasoningModel: config.reasoningModel,
        fallbackModel: config.fallbackModel,
      },
    });

    if (args.dryRun) {
      return {
        answer: `DRY RUN: ${chunks.length} context chunks prepared.`,
        citations: chunks.flatMap((c) => c.snippetIds).slice(0, 12),
        modelUsed: route.model,
        routeTier: route.tier,
      };
    }

    const systemPrompt =
      'You are a CRM revenue copilot. Use only provided CRM context. Output concrete next actions to increase win probability. Cite record IDs in square brackets.';
    const answer = await callOpenRouter(
      route.model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `CRM Context:\n${contextText}\n\nUser request:\n${args.prompt}` },
      ],
      config.temperature,
    );

    return {
      answer,
      citations: chunks.flatMap((c) => c.snippetIds).slice(0, 20),
      modelUsed: route.model,
      routeTier: route.tier,
    };
  },
});
```

**Step 3: Verify with dry-run (no external call)**

Run:

```bash
npx convex run crm/ai/chat:askSalesAssistant '{"prompt":"How can we win more deals this month?","dryRun":true}'
```

Expected: JSON with `routeTier`, `modelUsed`, and non-empty `citations`.

**Step 4: Verify lint**

Run:

```bash
npm run lint
```

**Step 5: Commit**

```bash
git add convex/crm/ai/chat.ts
git commit -m "feat(ai): add openrouter-backed sales assistant action with fallback-ready routing"
```

---

### Task 6: Add CRM Assistant UI Route and Sidebar Entry

**Files:**
- Create: `src/components/crm/ai-assistant-panel.tsx`
- Create: `src/routes/_authenticated/assistant.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Step 1: Create assistant route**

Create `src/routes/_authenticated/assistant.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AiAssistantPanel } from '@/components/crm/ai-assistant-panel';

export const Route = createFileRoute('/_authenticated/assistant')({
  component: AssistantPage,
});

function AssistantPage() {
  return <AiAssistantPanel />;
}
```

**Step 2: Build chat panel component**

Create `src/components/crm/ai-assistant-panel.tsx` using `useAction(api.crm.ai.chat.askSalesAssistant)` with:
- prompt textarea
- submit button
- loading state
- rendered answer
- citations list
- “route tier/model used” metadata for trust/debug

Use this shape for local state:

```tsx
type AssistantResponse = {
  answer: string;
  citations: string[];
  modelUsed: string;
  routeTier: string;
};
```

**Step 3: Add sidebar navigation item**

In `src/components/layout/app-sidebar.tsx`, add:

```tsx
{
  title: 'Assistant',
  url: '/assistant',
  icon: Sparkles,
  roles: ['admin', 'staff', 'client'],
},
```

and import `Sparkles` from `lucide-react`.

**Step 4: Manual UI verification**

Run:

```bash
npm run dev
```

Check:
- `/assistant` route loads
- Prompt submit triggers action
- Answer and citations render

**Step 5: Commit**

```bash
git add src/components/crm/ai-assistant-panel.tsx src/routes/_authenticated/assistant.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(ai): add authenticated assistant page backed by crm knowledge"
```

---

### Task 7: Add Admin Settings for Model Routing and Chunk Limits

**Files:**
- Modify: `src/routes/_authenticated/settings.tsx`

**Step 1: Wire config query + mutation into settings page**

Add:
- `const aiConfig = useQuery(api.crm.ai.config.getAiConfig, isAdmin ? {} : 'skip');`
- `const upsertAiConfig = useMutation(api.crm.ai.config.upsertAiConfig);`

**Step 2: Add “AI Assistant” settings card**

Include controls for:
- enabled toggle
- fast/reasoning/fallback model IDs
- max chunk tokens
- max chunks
- max context tokens
- temperature

Use existing shadcn components already used on the page (`Card`, `Input`, `Switch`, `Button`, `Label`).

**Step 3: Save and validate**

On save:
- enforce `maxChunkTokens >= 300`
- enforce `maxChunks >= 1`
- enforce `temperature` between `0` and `1`
- call `upsertAiConfig.mutateAsync(...)`

**Step 4: Verify settings persistence**

Run and validate in browser:
- change model IDs and limits
- reload `/settings`
- confirm values are persisted

**Step 5: Commit**

```bash
git add src/routes/_authenticated/settings.tsx
git commit -m "feat(ai): expose model routing and chunk controls in settings"
```

---

### Task 8: End-to-End Verification, Docs, and Progress Tracking

**Files:**
- Modify: `TODO.md`
- Modify: `PROGRESS.md`
- Modify: `docs/plans/2026-02-13-openrouter-phase-2a-model-routing-and-chunking.md`

**Step 1: Run full verification suite**

Run:

```bash
npm run test:ai
npm run lint
npx convex run crm/ai/chat:askSalesAssistant '{"prompt":"Give me top 3 opportunities to close this week","dryRun":true}'
```

Expected:
- tests pass
- lint passes
- dry-run returns citations and route metadata

**Step 2: Real-call smoke test (only if key configured)**

Run:

```bash
npx convex run crm/ai/chat:askSalesAssistant '{"prompt":"Draft a next-step email for the highest-value stalled deal"}'
```

Expected: Non-empty answer with sales guidance and record citations.

**Step 3: Update human-readable tracking docs**

Update `TODO.md`:
- mark OpenRouter Phase 2A tasks complete
- add follow-up item for Phase 2B (memory + conversation history)

Update `PROGRESS.md`:
- add a new section “OpenRouter Phase 2A: Model Routing + Chunking”
- mark completion status and list files delivered

**Step 4: Final commit**

```bash
git add TODO.md PROGRESS.md docs/plans/2026-02-13-openrouter-phase-2a-model-routing-and-chunking.md
git commit -m "docs(ai): close phase 2a with verification notes and progress updates"
```

---

## Phase 2A Exit Criteria

- AI assistant responses are grounded in org CRM data (with citation IDs).
- Routing chooses `fast` vs `reasoning` model deterministically and observably.
- Chunking respects configured token budgets and chunk limits.
- OpenRouter secrets remain server-side only.
- Admin can tune model/chunk settings without code changes.

## Risks and Mitigations

- **Risk:** context payload too large for model window.
  - **Mitigation:** hard cap by `maxChunks`, `maxChunkTokens`, `maxContextTokens`.
- **Risk:** hallucinated recommendations not tied to CRM facts.
  - **Mitigation:** strict system prompt + citations + context-only policy.
- **Risk:** high model spend.
  - **Mitigation:** default fast-tier routing and admin-configurable models.

## Suggested Phase 2B Scope

1. Conversation memory (threaded history per user/org).
2. Tool-calling actions (create follow-up task, update close date, draft/send email).
3. Opportunity scoring and proactive “next best action” nudges.
