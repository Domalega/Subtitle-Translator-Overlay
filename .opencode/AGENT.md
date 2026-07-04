# AGENT

## General

Always prefer minimal, targeted changes.

Preserve the existing project architecture unless explicitly instructed otherwise.

Do not refactor working code without a clear reason.

Follow the existing coding style.

Avoid rewriting entire modules when a small patch is sufficient.

---

# Read Optimization

Before reading any file:

1. Decide whether it is actually required.
2. Prefer symbol search over reading entire files.
3. Read the minimum number of files required.
4. Never read more than 3 files before making the first edit.
5. Stop reading as soon as the target code is found.

Never read:

- node_modules
- dist
- build
- release
- generated files
- package-lock.json
- yarn.lock

unless explicitly requested.

Never reread a file that has already been read during the current session unless:

- another modified file depends on it;
- its interface changed;
- I explicitly request rereading.

Reuse information already learned during the session.

---

# Editing

Prefer the smallest possible patch.

Do not rewrite complete files.

Do not change formatting unrelated to the task.

Preserve:

- naming
- architecture
- file structure
- coding style

Never add comments unless requested.

Never rename files unless requested.

---

# Performance

Avoid unnecessary filesystem operations.

Avoid scanning the whole project.

Never perform broad searches if the request clearly targets one component.

If a UI element is mentioned, first search its visible text before reading files.

For CSS:

Read only the stylesheet responsible for the component.

For Electron:

Inspect only the renderer/preload/main files that are directly related.

---

# Electron

Never modify:

- OCR logic
- translation engine
- capture pipeline

unless explicitly requested.

UI improvements should not change business logic.

---

# Runtime

Prefer fixing the root cause instead of masking symptoms.

If runtime errors exist:

1. Identify the cause.
2. Fix the cause.
3. Only then update UI if needed.

---

# Build

Do not build automatically.

Build only when:

- I explicitly request it;
- or the current task explicitly ends with a build.

If build fails:

Fix the issue.

Retry the build.

Repeat until successful or blocked by an external issue.

Never silently ignore build errors.

---

# Git Policy

Git is user-controlled.

Never execute any Git command unless I explicitly request it.

Forbidden by default:

- git status
- git diff
- git log
- git add
- git commit
- git push
- git pull
- git fetch
- git merge
- git rebase
- git reset
- git restore
- git checkout
- git switch
- git stash
- git clean
- git tag
- branch creation
- branch deletion

Never modify repository history.

Never stage files.

Never create commits.

Never push.

When I explicitly request a commit:

- Commit only files related to the requested task.
- Use a concise English Conventional Commit message.
- Exclude unrelated changes.

After committing always report:

Commit:
- Hash
- Branch
- Message

Summary:
- What changed
- Main files modified
- Breaking changes (if any)

When I explicitly request push:

Also report:

Push:
- Remote
- Branch
- Status

---

# Response Optimization

Do not explain your plan before acting.

Do not narrate every intermediate step.

Do the work first.

Explain only after completion.

Keep summaries concise.

Do not produce long reports.

---

# Communication

If the request is ambiguous:

Ask one short clarification question.

Otherwise:

Act.

Do not ask for confirmation for obvious implementation details.

---

# Token Efficiency

Minimize token usage.

Avoid repeated explanations.

Avoid rereading files.

Avoid generating large diffs.

Avoid producing code unrelated to the requested change.

Use the smallest context necessary.

---

# Default Workflow

1. Determine affected files.
2. Read the minimum required.
3. Implement the smallest patch.
4. Verify syntax.
5. Run only the necessary checks.
6. Build only if requested.
7. Provide a concise summary.