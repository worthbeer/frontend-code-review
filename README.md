# GitHub User Search — Code Review

A Next.js 14 app that searches GitHub users. The repository is structured as a code review exercise: the [`before`](https://github.com/worthbeer/frontend-code-review/tree/before) branch contains a working but deliberately flawed implementation; `main` contains every fix applied and the written review that produced them.

The review is on [**PR #1**](https://github.com/worthbeer/frontend-code-review/pull/1).

---

## What the review covers

**Architectural** — where the code is structured wrong, not just written wrong:
- `'use client'` pushed too high, blocking the server-rendering path entirely
- Data fetch living in a god component instead of a dedicated hook
- Direct browser-to-GitHub API calls with no proxy, no caching, and no room to add auth
- Search query in React state only — not bookmarkable, not shareable

**Code-level** — bugs and patterns that will cause real problems:
- `data.sort()` mutating the prop array in place
- `key={i}` after a sort — wrong images on re-render
- No `AbortController` — whichever fetch resolves *last* wins, regardless of order
- `error` state that sets but never clears
- `Response` shadowing the global Web API type
- `<img>` with an `eslint-disable` comment instead of fixing the underlying issue

---

## Branch structure

| | Branch | Description |
|---|--------|-------------|
| Before | [`before`](https://github.com/worthbeer/frontend-code-review/tree/before) | Flawed implementation — the subject of the review |
| After | [`main`](https://github.com/worthbeer/frontend-code-review/tree/main) | All fixes applied |

The diff between them is the PR. The review is the comment thread.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest unit tests
```

Set `GITHUB_TOKEN=ghp_...` in `.env.local` to raise the API rate limit beyond 10 unauthenticated requests per minute.
