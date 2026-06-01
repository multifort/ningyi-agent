---
name: project-spec
description: Turn a feature request or bug report into a short, testable spec for this project before any code is written. Use at the start of non-trivial work.
version: 1.0.0
metadata:
  hermes:
    tags: [spec, planning, project]
    category: software-development
---
# Project Spec

## When to Use
Use whenever a request is more than a one-line fix: new features, behavior
changes, anything touching more than one module, or anything ambiguous. Skip for
trivial, obvious edits.

## Procedure
1. Read `docs/context.md` and the relevant part of `docs/architecture.md`.
2. Restate the request in one sentence. If intent is unclear, ask ONE clarifying
   question before proceeding.
3. Write a spec to `docs/specs/<short-slug>.md` (create the folder if needed) with:
   - **Goal** — the user-visible outcome.
   - **Acceptance criteria** — bullet list, each independently testable.
   - **Out of scope** — what this change deliberately does not do.
   - **Affected areas** — components/paths from the architecture doc.
   - **Risks / unknowns** — anything that could invalidate the plan.
4. Confirm the spec with the user when stakes are high; otherwise proceed to plan.

## Pitfalls
- Acceptance criteria that aren't testable ("works well") — rewrite as observable.
- Silently widening scope — put extras under "Out of scope" instead.
- Duplicating architecture detail — link to `docs/architecture.md`, don't copy.

## Verification
- The spec file exists and every acceptance criterion is something a test or a
  manual check could confirm pass/fail.
