# Worktree Planning and Merge Policy

**⚠️ DEPRECATED - This policy is no longer active**

**New Policy:** Work directly in main branch only. See `AGENTS.md` for current workflow.

---

_This file is kept for historical reference but is superseded by the "Progress Tracking for Human Visibility" section in AGENTS.md._

## Historical Policy (Not in Use)

The previous policy recommended using git worktrees for feature isolation. This has been replaced with a direct main-branch workflow to simplify development and testing.

### Old Rules (No Longer Apply)

- ~~Draft in `.planning/`~~
- ~~Publish to `docs/plans/`~~
- ~~Merge from clean worktrees~~

### New Rules (See AGENTS.md)

- Work directly in `/Users/boss/Develpment/iSaas-CRM` (main branch)
- Update `TODO.md` and `PROGRESS.md` after every task
- Commit frequently with descriptive messages
- Never create worktrees or feature branches
