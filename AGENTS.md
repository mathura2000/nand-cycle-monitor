<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Project documentation

**Current handoff:** `docs/NAND-Cycle-Monitor_HANDOFF_v21_2026-11-07.md`

Single canonical doc. Part One is narrative (context, findings, decisions, next
steps, session prompts); Part Two is the quarterly ingest operating procedure
(sources, CIKs, derivation rules, DART steps, filing calendar, consistency check SQL,
write procedure). It supersedes HANDOFF v20 and the retired `INGEST_RUNBOOK.md`.

Read it fully before touching signal logic, ingest, or chart rendering.

**When a new handoff supersedes it, update the filename above in the same commit.**
The dated filename is the version; this pointer is what makes that safe.
