# Routine implementation decisions

These are the implementation rulings made during the goal, in order. The user approved clinician-owned routines and autonomous implementation; no clinical content or retention/removal policy was inferred.

| Decision | Reason | Cost if the choice changes or proves wrong |
| --- | --- | --- |
| Versioned morning/evening assignments with whole-routine dated completion; legacy routines remain separate | Matches clinician assignment and patient reporting without inventing step-level clinical semantics | Step-level completion would require an additive data/UI change |
| Preserve reports for previously active versions after later edits, without completing the replacement | An offline report must retain the version actually viewed | A stricter historical-report policy would require an explicit product decision and compatible validation changes |
| Reuse the isolated linked worktree and install independent backend dependencies | Preserves the original checkout and avoids cross-checkout Prisma generation | Another workspace strategy would require relocating/revalidating the local runtime; original handoff changes and stash remain preserved |
| Expand the canonical recovery check to the full migration chain while retaining approved baseline hashes | Additive schema changes must pass the real recovery/CI path | Additional recovery validation code must be maintained as schema/platform coverage grows |
| Add a reproducible, loopback-only synthetic fixture helper | Future UI checks need the same assigned patient and prior-day state without private session files | The test helper requires maintenance and exact-identity cleanup verification |
