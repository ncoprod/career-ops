# Agent Compatibility

Career-Ops now has a universal core and thin runtime adapters.

## Source of Truth

- `AGENTS.md` is the canonical agent guide.
- `CLAUDE.md` is a compatibility layer for Claude Code.
- `.claude/skills/career-ops/SKILL.md` keeps the existing slash-command router for Claude/OpenCode.

## Runtime Strategy

### Claude Code / OpenCode

Supported directly:

- slash-command routing remains available,
- the built-in batch worker provider `claude` is verified,
- the same `modes/*` files are reused.

### Codex, Gemini CLI, and Other Runtimes

Supported through the universal core:

- load `AGENTS.md`,
- follow the same `modes/*`,
- use the same user/system data contract,
- plug batch mode in through an adapter script.

## Batch Adapter Contract

Out of the box, the runner only ships with a verified Claude provider because this repository already documented that CLI. To avoid inventing unsupported flags for other tools, all non-Claude runtimes use an explicit adapter.

Runner inputs:

```text
adapter <resolved-system-prompt-file> <user-prompt>
```

Environment provided by the runner:

- `CAREER_OPS_PROJECT_DIR`
- `CAREER_OPS_BATCH_DIR`
- `CAREER_OPS_AGENT`
- `CAREER_OPS_BATCH_ID`
- `CAREER_OPS_REPORT_NUM`
- `CAREER_OPS_TARGET_URL`

Expected behavior:

- read the resolved system prompt file and the user prompt,
- invoke the target runtime,
- stream final worker output to stdout,
- exit `0` on success, non-zero on failure.

See `batch/agent-adapter.example.sh` for the skeleton.
