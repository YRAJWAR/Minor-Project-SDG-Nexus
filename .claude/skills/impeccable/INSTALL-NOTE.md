# Impeccable — installed as guidance only

Source: https://github.com/pbakaus/impeccable (Apache-2.0), commit 2fc5e14 (2026-11-26).

Copied: SKILL.md, reference/*.md, scripts/command-metadata.json, scripts/data/*.json, LICENSE.

Deliberately NOT copied:
- scripts/impeccable, scripts/impeccable.cmd, engine-checksums.txt — the launcher that downloads and runs a native engine binary.
- scripts/live-browser*.js, modern-screenshot.umd.js — live mode (can launch the agent with permissions bypassed).
- .claude/settings.json — hooks that run the engine on every session start, edit and turn end.
- .claude/agents/* — subagents (the reference/degraded/* fallbacks cover them).

So steps in SKILL.md that say "run scripts/impeccable <verb>" are unavailable here; use the reference
guides directly. To get the full detector + hooks, the project owner can run `npx impeccable install` themselves.
