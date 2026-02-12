# Starter Template Cleanup Reference

This document explains how the iSaaSIT repo is maintained as both a personal development environment and a clean public starter template.

## What Was Cleaned

### Personal files removed from git tracking (still on disk)

| Path | Purpose |
|------|---------|
| `.planning/` | GSD project planning, phase docs, roadmaps, research |
| `Project documents/` | Personal reference docs (Convex LLMs, WorkOS notes, project scope) |
| `convex.skill` | Personal Convex skill file |
| `deno.lock` | Deno lockfile (not needed for the npm-based starter) |

These files are listed in `.gitignore` so they won't be re-added accidentally.

### Personal references replaced with placeholders

All instances of personal GitHub URLs and author names were replaced:

- `Kieransaunders/iSaaSIT` -> `your-org/your-repo`
- `Kieran Saunders` / `Kieran` -> `Your Name`
- Blog author key `kieran` -> `author`

**Files edited:** `src/routes/index.tsx`, `README.md`, `SETUP.md`, `docs/astro.config.mjs`, `docs/src/content/docs/index.mdx`, `docs/src/content/docs/guides/introduction.mdx`, `docs/src/content/docs/guides/quick-start.mdx`, `docs/src/content/docs/blog/getting-started.mdx`, `docs/src/content/docs/blog/multi-tenant-architecture.mdx`, `docs/src/content/docs/blog/deploying-to-production.mdx`, `docs/src/content/docs/blog/authentication-best-practices.mdx`, `docs/README.md`

## Dual-Purpose Repo Workflow

### How it works

1. **Git tracks only starter template files** - what other developers clone
2. **`.gitignore` excludes personal dev files** - planning docs, personal configs stay local
3. **`git rm --cached`** was used to stop tracking files without deleting them from disk

### For your local development

Your personal files (`.planning/`, `Project documents/`, etc.) remain on disk and work normally. They just won't appear in `git status` or get pushed.

### For the public template

When someone clones the repo, they get a clean starter with placeholder values they can customize (`your-org/your-repo`, `Your Name`).

## Maintaining This Pattern

### Adding new personal files

If you create a new personal file/directory that shouldn't ship:

```bash
# 1. Add to .gitignore
echo "my-personal-dir/" >> .gitignore

# 2. If already tracked, untrack it
git rm --cached -r my-personal-dir/
```

### Checking for leaks

Run this periodically to confirm no personal references snuck back in:

```bash
git grep -i "Kieransaunders\|kieran\|iconnectit\|fearless-greyhound"
# Should return zero results
```

## What stays in the template (intentionally)

- **Product name "iSaaSIT"** - the starter's identity
- **`.claude/`** - GSD tooling, skills, agents (useful for any dev)
- **`.agents/` and `.cursor/`** - AI coding rules
- **`AGENTS.md`, `LLM.txt`** - AI context docs
- **`package.json`** - WorkOS template URLs are correct upstream references
- **`LICENSE`** - WorkOS copyright is the upstream license
- **`.clauderc`** - Convex MCP config (useful for any dev)
