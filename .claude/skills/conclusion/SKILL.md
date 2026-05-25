---
name: conclusion
description: 当用户说 "conclusion"、"总结"、"wrap up"、"update handoff"、"收尾"、"结束今天" 或类似收尾关键词时触发。自动把当前会话所做的所有工作更新进项目根目录的 HANDOFF.md，让下一次会话能立刻接上下文。也适用于用户明确要求 "把今天做的更新到 HANDOFF" 的场景。
---

# Conclusion — Auto-update HANDOFF.md

You are the session's bookkeeper. When invoked, regenerate `HANDOFF.md` at the repo root so that the next Claude Code session (cold-start, no memory of this conversation) can read one file and immediately continue the work.

## Trigger words

- English: `conclusion`, `summary`, `wrap up`, `update handoff`, `end of day`
- Chinese: `总结`, `收尾`, `结束今天`, `把今天的更新到 handoff`

## What to do

1. **Read the current `HANDOFF.md`** at the project root to understand the baseline structure and what was already done in prior sessions. Preserve its structure and section headings.

2. **Review the current session** — collect:
   - New migrations applied (file path + what they did + verified status)
   - New files created (path + one-line purpose)
   - Existing files edited (path + what changed and why)
   - Files deleted (path + why)
   - New action items the user must do (e.g., dashboard configs, native rebuilds, key rotations)
   - Bugs discovered but NOT yet fixed (include diagnosis + next step)
   - Locked-in decisions (URLs, IDs, version numbers, env keys)

3. **Rewrite `HANDOFF.md`** with the structure:
   - `**Last updated:** YYYY-MM-DD (session N)` — bump date to today, increment session number
   - `**Status:** ...` — one-line: what's done, what's blocked, what's next
   - "How to resume next session" — keep stable
   - "Decisions already locked in" table — add new rows, never remove old ones
   - "✅ Part X — ..." done sections — keep historical, add new ones
   - "✅ Session N bugfixes from manual test pass" table — new section for each session that did test-cycle work
   - "⚠ Active bugs discovered, NOT YET fixed" — replace with current open issues
   - "⚠ Action items still pending on the user (cumulative)" — append new, mark old as carry-over
   - "🔜 Part X — ... (pending)" — what's still ahead
   - "File-level reference: what changed in this session (session N)" — concrete list of touched paths
   - "File-level reference: what changed in session N-1 (for context)" — demote previous session's file list

4. **Update memory** if any session-level discovery is worth persisting across many future conversations (use auto-memory rules — only project facts that aren't visible from code). Don't duplicate what's already in `HANDOFF.md`.

## Style rules for HANDOFF.md

- **Concrete > generic.** Always include exact file paths, exact SQL snippets, exact CLI commands. Future-Claude needs to act, not interpret.
- **Quote error messages verbatim.** "permission denied for table content_reports" — not "an RLS error".
- **Distinguish "done" from "blocked on user".** Done = code is shipped, migration applied, file written. Blocked = waiting for user action like a dashboard toggle, rebuild, or API key rotation.
- **Don't duplicate the codebase.** If the info is visible by reading `git log` / a file / `supabase migration list`, don't restate it. Point to the file.
- **No marketing language.** No "successfully implemented", no "robust solution". Just facts: what, why, where.
- **Tables for repeated structure**, prose for single-shot context.
- **Carry-over indicator.** When an old action item is still pending, mark it `(carry-over)` so future-Claude sees it isn't new.

## Don't include

- Routine code patterns or architecture (those live in the code itself)
- Conversation transcript or back-and-forth dialogue
- Re-explanations of how Supabase/RN/Expo work
- Promises about future cleanups not yet planned

## Final step

After saving `HANDOFF.md`, tell the user in 2-3 sentences:
- What date/session-number was written
- What's the single most important thing for next session to know
- Any new memory entries created
