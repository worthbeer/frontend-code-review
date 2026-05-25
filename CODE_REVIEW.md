# Code Review: `before`

> **Reviewer note:** This review is intentionally thorough and direct. This is a learning exercise. Every issue below represents a real problem — some are bugs that will break in production, others are patterns that will cause pain as the codebase grows. Nothing here is nitpicking for its own sake.

---

## Part 1 — Architectural Issues

---

### 1. `Search.tsx` is a God Component — extract a `useUserSearch` custom hook

**File:** `src/app/Search.tsx`

`Search.tsx` is doing three distinct jobs at once: managing fetch logic, managing derived UI state (`isLoading`, `error`), and rendering markup. This makes it harder to test, harder to reuse, and harder to reason about. The data-fetching concern belongs in a dedicated hook.

**Bad:**
```tsx
// Search.tsx — all concerns tangled together
const Search = () => {
    const [error, setError] = useState(false)
    const [search, setSearch] = useState('')
    const [searchInputValue, setSearchInputValue] = useState('')
    const [data, setData] = useState([] as UserType[])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        setIsLoading(true)
        userFetcher(search)
            .then(data => { setIsLoading(false); setData(data) })
            .catch(() => { setIsLoading(false); setError(true) })
    }, [search])
    // ... all the JSX too
}
```

**Better:**
```tsx
// src/hooks/useUserSearch.ts
export function useUserSearch() {
    const [query, setQuery] = useState('')
    const [data, setData] = useState<UserType[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!query) return
        const controller = new AbortController()
        setIsLoading(true)
        setError(null)
        userFetcher(query, controller.signal)
            .then(results => { setData(results); setIsLoading(false) })
            .catch(e => {
                if (e.name === 'AbortError') return
                setError('Failed to fetch users.')
                setIsLoading(false)
            })
        return () => controller.abort()
    }, [query])

    return { data, isLoading, error, query, setQuery }
}

// Search.tsx — now just a thin UI shell
const Search = () => {
    const { data, isLoading, error, setQuery } = useUserSearch()
    const [inputValue, setInputValue] = useState('')
    // ...render only
}
```

---

### 2. Pushing the `'use client'` boundary too high — data fetch should start server-side

**File:** `src/app/Search.tsx`, `src/app/page.tsx`

`page.tsx` is a Server Component by default in the App Router, but it immediately renders `<Search />` which is `'use client'`. This means the entire feature tree — including the initial data fetch — runs exclusively in the browser. The App Router's entire value proposition is that you can fetch data on the server, stream it to the client, and hydrate only the interactive parts. By marking `Search` as a client component and putting the fetch inside `useEffect`, you get no server rendering, no streaming, and a waterfall: HTML → JS → fetch → render.

**Bad:**
```tsx
// page.tsx — Server Component that immediately hands off to client
import Search from './Search'
export default function Home() {
    return <Search />
}
```

**Better:**
```tsx
// page.tsx — fetch initial data on the server
import SearchShell from './SearchShell'
import { userFetcher } from '../getUsers'

export default async function Home({ searchParams }: { searchParams: { q?: string } }) {
    const initialQuery = searchParams.q ?? ''
    const initialData = initialQuery ? await userFetcher(initialQuery) : []
    return <SearchShell initialData={initialData} initialQuery={initialQuery} />
}

// SearchShell.tsx — 'use client' only for the interactive input and state updates
'use client'
// ... receives initialData as a prop, handles subsequent searches client-side
```

---

### 3. Direct browser-to-GitHub API call — no server route, no auth header, guaranteed rate limiting

**File:** `src/getUsers.ts`

`userFetcher` calls `api.github.com` directly from the browser. This pattern has three compounding problems:

1. **Aggressive rate limiting.** The GitHub Search API allows only 10 unauthenticated requests per minute per IP. In a shared network or office environment, the first 10 searches from any user exhaust the quota for everyone on that IP. A server-side proxy can attach a `Authorization: token <PAT>` header and gets 30 requests per minute per authenticated user — or more with a GitHub App.
2. **No server-side caching.** Every visitor triggers a fresh request. Next.js's `fetch` with `{ next: { revalidate: 60 } }` on the server would serve the same query from cache for 60 seconds.
3. **Token exposure risk.** If you add authentication later to raise the rate limit, the token must be included in the browser request — where it is visible to anyone with devtools open. A server route keeps tokens server-side.

**Bad:**
```ts
// Calls GitHub API directly from the browser — rate limited and unauthenticated
export const userFetcher = async (search: string = '') => {
    return fetch(`https://api.github.com/search/users?q=${search}`)
```

**Better:**
```ts
// src/app/api/users/route.ts — a Next.js Route Handler as a server-side proxy
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q') ?? ''
    const res = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=30`,
        {
            headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
            next: { revalidate: 60 },
        }
    )
    if (!res.ok) return NextResponse.json({ error: 'Upstream error' }, { status: res.status })
    const json = await res.json()
    return NextResponse.json(json.items)
}

// getUsers.ts — now calls your own API
export const userFetcher = async (search = '', signal?: AbortSignal) =>
    fetch(`/api/users?q=${encodeURIComponent(search)}`, { signal }).then(r => r.json())
```

---

### 4. No URL state for the search query — refresh or share loses the search

**File:** `src/app/Search.tsx`

The current search query lives entirely in React state. If a user finds a result they want to share, copies the URL, and sends it to a colleague, that colleague sees a blank page. The back button also does nothing useful. In Next.js App Router, URL state is the correct place for anything that should be bookmarkable or shareable.

**Bad:**
```tsx
const [search, setSearch] = useState('')
// search only lives in memory — lost on refresh
```

**Better:**
```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const SearchShell = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const search = searchParams.get('q') ?? ''

    const handleSearch = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('q', value)
        router.push(`?${params.toString()}`)
    }
    // ...
}
```

---

### 5. Bot filtering (`filterBotAccounts`) placed inside a presentation component

**File:** `src/Components/Results.tsx`

`filterBotAccounts` is a business/policy concern, not a display concern. Putting it inside `Results.tsx` means:

- It is invisible to anyone looking at the data layer.
- It is bypassed if you ever render user results through any other component.
- It cannot be tested or modified without touching the UI file.
- It leaks policy into a component whose only job is to display a list.

This function belongs at the API/server layer — either applied in the Route Handler before the response is sent, or at minimum inside `useUserSearch` before the data enters the component tree.

**Bad:**
```tsx
// Results.tsx — a display component doing account policy filtering
const filterBotAccounts = (data: UserType[]) => { /* ... */ }

const Results = ({ isLoading, data }: ResultsProps) => {
    let sanitizedData = filterBotAccounts(data.sort(...))
    return <div>...</div>
}
```

**Better:**
```ts
// src/lib/filterContent.ts — isolated, testable policy function
export const filterBotAccounts = (data: UserType[]): UserType[] =>
    data.filter(user => !/(\[bot\]|-bot$)/i.test(user.login))

// Applied in the hook or server layer, before data reaches any component
```

---

### 6. `Results.tsx` marked `'use client'` with no hooks or event handlers

**File:** `src/Components/Results.tsx`

`'use client'` is not a harmless annotation — it opts the entire component subtree out of server rendering and increases the JavaScript bundle sent to the browser. `Results.tsx` has no `useState`, no `useEffect`, no event handlers, and no browser APIs. It is a pure rendering function. There is no justification for the directive at all.

**Bad:**
```tsx
'use client'  // <-- Why?

import { UserType } from '../types'
// No hooks, no event handlers, no browser APIs anywhere in this file
const Results = ({ isLoading, data }: ResultsProps): JSX.Element => { ... }
```

**Better:**
```tsx
// Remove 'use client' entirely. Results.tsx is a valid Server Component.
import { UserType } from '../types'
const Results = ({ isLoading, data }: ResultsProps) => { ... }
```

---

### 7. Inconsistent file and folder naming conventions

**Files:** `src/Components/Results.tsx` vs `src/app/Search.tsx`

The project mixes two casing conventions: `src/Components/` (PascalCase directory) and `src/app/` (lowercase directory). Next.js App Router uses lowercase for its `app/` directory by convention, and the broader React ecosystem convention is lowercase folders with PascalCase filenames. Pick one and apply it consistently across the entire project. This matters because file system case sensitivity differs between macOS (case-insensitive by default) and Linux (case-sensitive, i.e., production), which can cause imports that work locally to fail in CI/CD or on a Linux deploy target.

**Fix:** Rename `src/Components/` to `src/components/` and update all imports.

---

### 8. `UserType` is missing the `id` field that the API returns

**File:** `src/types.ts`, `src/getUsers.ts`

The GitHub Search API response includes an `id` field for every user. `UserType` has no `id` property. The field arrives over the wire and is silently discarded by TypeScript. This means `id` is never available in the component layer — which is precisely the field that should be used as the React `key` prop (see Issue 9).

**Bad:**
```ts
// types.ts — id is missing
export interface UserType {
    login: string
    avatar_url: string
    html_url: string
    score: number
}
```

**Better:**
```ts
export interface UserType {
    id: number        // <-- add this; it's returned by the API
    login: string
    avatar_url: string
    html_url: string
    score: number
}
```

---

## Part 2 — Code-Level Issues

---

### 9. `key={i}` uses array index instead of a stable identifier

**File:** `src/Components/Results.tsx`, line where `sanitizedData.map` is called

Using the array index as a React key is a well-known footgun. Because the data is sorted before rendering, the item at index 0 changes every time the query changes. React uses the key to decide which DOM nodes to reuse vs. recreate; index keys cause incorrect reconciliation, stale state in child components, and subtle UI bugs (e.g., wrong avatar images briefly appearing during re-renders).

**Bad:**
```tsx
{sanitizedData.map((user, i) =>
    <Display key={i} {...user} />
)}
```

**Better:**
```tsx
// Requires fixing Issue 8 first so UserType has an `id` field
{sanitizedData.map(user =>
    <Display key={user.id} {...user} />
)}
```

---

### 10. `data.sort()` mutates the prop array in place

**File:** `src/Components/Results.tsx`

`Array.prototype.sort()` sorts the array in place and returns the same reference. `Results` receives `data` as a prop — mutating it means the parent component's state array is silently modified. This violates React's rule that props are read-only and can cause unpredictable re-renders or stale state in parent components. It is also a side effect inside a render function, which React's Strict Mode will surface as a bug.

**Bad:**
```tsx
let sanitizedData = filterBotAccounts(
    data.sort((a: UserType, b: UserType) => b.score - a.score)
)
```

**Better:**
```tsx
const sanitizedData = filterBotAccounts(
    [...data].sort((a, b) => b.score - a.score)
    // or: data.toSorted((a, b) => b.score - a.score)  // ES2023, non-mutating
)
```

---

### 11. `filterBotAccounts` uses a manual `for` loop and `.match()` instead of `.filter()` and `.test()`

**File:** `src/Components/Results.tsx`

This is two problems in one function. First, `.filter()` exists precisely to produce a filtered copy of an array — the manual `for` loop with a `push` is verbose, harder to read, and more error-prone. Second, `String.prototype.match()` returns an array (or null) and is semantically designed for capturing groups. When you only need a boolean, `RegExp.prototype.test()` is the correct method — it is faster (short-circuits on first match), returns a boolean directly, and communicates intent clearly.

**Bad:**
```ts
const filterBotAccounts = (data: UserType[]) => {
    const filteredData: UserType[] = []
    for(let i = 0; i < data.length; i++) {
        if(!data[i].login.match(/\[bot\]|-bot$/i)) {
            filteredData.push(data[i])
        }
    }
    return filteredData
}
```

**Better:**
```ts
const filterBotAccounts = (data: UserType[]): UserType[] =>
    data.filter(user => !/(\[bot\]|-bot$)/i.test(user.login))
```

---

### 12. Sort and filter run on every render with no memoization

**File:** `src/Components/Results.tsx`

`data.sort(...)` and `filterBotAccounts(...)` are called unconditionally inside the render body of `Results`. Every time any parent re-renders — even for unrelated state changes — this work repeats from scratch. For a result set of any real size this is wasteful. Since `Results` is currently a client component (wrongly, see Issue 6), `useMemo` with `data` as a dependency is the right fix. If `Results` is converted to a Server Component, this becomes moot since it only renders once per request.

**Bad:**
```tsx
const Results = ({ isLoading, data }: ResultsProps) => {
    if(isLoading) return <></>
    let sanitizedData = filterBotAccounts(
        data.sort((a, b) => b.score - a.score)
    )
    return (...)
}
```

**Better (if kept as a client component):**
```tsx
const Results = ({ isLoading, data }: ResultsProps) => {
    const sanitizedData = useMemo(
        () => filterBotAccounts([...data].sort((a, b) => b.score - a.score)),
        [data]
    )
    if (isLoading) return null
    return (...)
}
```

---

### 13. `useEffect` fetch has no `AbortController` — causes state updates on unmounted components

**File:** `src/app/Search.tsx`

When the user types quickly and triggers multiple searches, each in-flight request races to completion. Whichever resolves last wins, regardless of whether it is the most recent query. Worse, if the component unmounts while a fetch is pending (e.g., the user navigates away), React will log a warning about updating state on an unmounted component, and in Strict Mode this is even more likely to surface. An `AbortController` solves both problems.

**Bad:**
```tsx
useEffect(() => {
    setIsLoading(true)
    userFetcher(search)
        .then(data => { setIsLoading(false); setData(data) })
        .catch(() => { setIsLoading(false); setError(true) })
}, [search])
```

**Better:**
```tsx
useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    userFetcher(search, controller.signal)
        .then(data => { setData(data); setIsLoading(false) })
        .catch(e => {
            if (e.name === 'AbortError') return
            setError('Failed to fetch users.')
            setIsLoading(false)
        })
    return () => controller.abort()
}, [search])
```

---

### 14. `isLoading` initialized to `true` before the user has done anything

**File:** `src/app/Search.tsx`

On initial page load the component immediately shows a loading state — before the user has typed anything, before any search has been issued. The correct initial state is `false`. Combined with Issue 2, this also means the loading indicator appears during SSR hydration for zero reason.

**Bad:**
```tsx
const [isLoading, setIsLoading] = useState(true)
```

**Better:**
```tsx
const [isLoading, setIsLoading] = useState(false)
```

---

### 15. `setError(true)` is never reset — error persists after a successful retry

**File:** `src/app/Search.tsx`

Once an error occurs, `error` is set to `true` and never cleared. If the user retries the same search or tries a different query, the error banner remains visible even after a successful response. The error state must be reset at the beginning of each fetch.

**Bad:**
```tsx
useEffect(() => {
    setIsLoading(true)
    // error is never cleared here
    userFetcher(search)
        .then(data => { setIsLoading(false); setData(data) })
        .catch(() => { setIsLoading(false); setError(true) })
}, [search])
```

**Better:**
```tsx
useEffect(() => {
    setIsLoading(true)
    setError(false)  // <-- reset on each new fetch
    userFetcher(search)
        .then(data => { setData(data); setIsLoading(false) })
        .catch(() => { setIsLoading(false); setError(true) })
}, [search])
```

Additionally, `error` should hold the error message as a string (or `null`), not a boolean, to allow meaningful error messages to be shown to the user (see Issue 22).

---

### 16. `<img>` used with an ESLint-disable comment instead of Next.js `<Image>`

**File:** `src/Components/Display.tsx`

Using a comment to silence a linting rule is a red flag — the lint rule exists for a reason. Next.js's `<Image>` component provides automatic lazy loading, responsive `srcset` generation, WebP conversion, and prevention of cumulative layout shift (CLS). The ESLint rule `@next/next/no-img-element` exists precisely to catch this. Silencing it means every avatar image is loaded eagerly, at full original size, with no format optimization. For a results grid showing dozens of users, this is a significant performance regression.

**Bad:**
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={avatar_url} alt={login} height="80" width="80" style={{ borderRadius: '50%' }} />
```

**Better:**
```tsx
import Image from 'next/image'

<Image
    src={avatar_url}
    alt={login}
    width={80}
    height={80}
    style={{ borderRadius: '50%' }}
/>
```

Note: `next.config.js` will need `images.remotePatterns` configured to allow the `avatars.githubusercontent.com` domain.

---

### 17. `<p>&nbsp;</p>` used as a visual spacer

**File:** `src/app/Search.tsx`

```tsx
<p>&nbsp;</p>
```

This is semantic HTML abuse. A `<p>` element means a paragraph of text. Using it as a spacer with a non-breaking space as its content is a practice from the early 2000s. It renders an empty paragraph in the accessibility tree, confuses screen readers, and creates spacing that is fragile and not tied to the design system. Use CSS margin or gap.

**Bad:**
```tsx
<p>&nbsp;</p>
```

**Better:**
```tsx
// Remove the element entirely. Control spacing with CSS:
<div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
    <div>{/* search input */}</div>
    <Results ... />
</div>
```

---

### 18. All styling via inline `style` props — no use of CSS Modules

**Files:** `src/app/Search.tsx`, `src/Components/Results.tsx`, `src/Components/Display.tsx`

Every element in the project is styled with inline `style` props. Inline styles have several concrete problems: they cannot use pseudo-selectors (`:hover`, `:focus`), cannot use media queries for responsive design, generate new object references on every render (minor but unnecessary GC pressure), and are inaccessible to the browser's devtools stylesheet panel. Next.js ships with CSS Modules support out of the box — the `src/app/globals.css` scaffolding already exists. Use it.

**Bad:**
```tsx
<div style={{ border: '1px solid #d0d7de', padding: '1em', borderRadius: '8px', width: '200px', background: '#f6f8fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5em' }}>
```

**Better:**
```tsx
// src/components/Display.module.css
.card {
    border: 1px solid #d0d7de;
    padding: 1em;
    border-radius: 8px;
    width: 200px;
    background: #f6f8fa;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
}
.card:hover {
    border-color: #0969da; /* now possible */
}

// Display.tsx
import styles from './Display.module.css'
<div className={styles.card}>
```

---

### 19. `<button>` is missing `type="button"`

**File:** `src/app/Search.tsx`

```tsx
<button onClick={() => setSearch(searchInputValue)}>Search</button>
```

A `<button>` without an explicit `type` attribute defaults to `type="submit"` when it is inside a `<form>` element. While the current code has no `<form>` wrapper, adding one in the future (which would be the correct semantic structure for a search input) would cause this button to immediately submit the form and trigger a full page reload. Explicitly setting `type="button"` removes the ambiguity.

**Better:**
```tsx
<button type="button" onClick={() => setSearch(searchInputValue)}>Search</button>
```

Also consider wrapping the input and button in a `<form>` with `onSubmit` so that the Enter key behavior is handled natively:

```tsx
<form onSubmit={e => { e.preventDefault(); setSearch(inputValue) }}>
    <input value={inputValue} onChange={e => setInputValue(e.target.value)} />
    <button type="submit">Search</button>
</form>
```

---

### 20. Search string is not `encodeURIComponent`-encoded in the URL

**File:** `src/getUsers.ts`

```ts
fetch(`https://api.github.com/search/users?q=${search}`)
```

If `search` contains a space, `&`, `#`, `+`, or any other URL-special character, the resulting URL is malformed. For example, searching for `"john doe"` produces `q=john doe` which may be sent as `q=john%20doe` or `q=john+doe` or may break the URL entirely. Searching for `"org:microsoft type:user"` would break the query string parsing for the `q` parameter entirely. Always encode user input before interpolating it into a URL.

**Bad:**
```ts
fetch(`https://api.github.com/search/users?q=${search}`)
```

**Better:**
```ts
const url = new URL('https://api.github.com/search/users')
url.searchParams.set('q', search)
url.searchParams.set('per_page', '30')
fetch(url.toString())
```

Or at minimum:
```ts
fetch(`https://api.github.com/search/users?q=${encodeURIComponent(search)}&per_page=30`)
```

---

### 21. `Response` type shadows the global Web API `Response`

**File:** `src/types.ts`

```ts
export interface Response { ... }
```

`Response` is a globally available Web API type (the return type of `fetch()`). Exporting an interface with the same name creates a collision: anywhere both are in scope, TypeScript will be confused about which `Response` is meant, and future engineers reading `r.json()` code that uses the `Response` type will have to inspect imports carefully to understand what they are looking at. Naming types after globally reserved names is a maintenance hazard.

**Bad:**
```ts
export interface Response {
    total_count: number
    incomplete_results: boolean
    items: UserType[]
}
```

**Better:**
```ts
export interface GitHubUserSearchResponse {
    total_count: number
    incomplete_results: boolean
    items: UserType[]
}
```

---

### 22. `userFetcher` does not check `r.ok` before calling `.json()`

**File:** `src/getUsers.ts`

```ts
return fetch(`...`).then(r => r.json())
```

`fetch()` only rejects on network failure — it resolves for any HTTP response, including 403 (rate limited), 422 (validation failed, e.g. empty query), and 503 (service unavailable). The GitHub API returns structured error JSON on failure (`{ message: "...", documentation_url: "..." }`), so calling `.json()` on an error response will silently parse the error body as if it were valid data — `items` will be `undefined`, and the app will crash with a confusing error downstream rather than at the point of failure. The `r.ok` flag (true for 2xx status codes) must be checked explicitly.

**Bad:**
```ts
export const userFetcher = async (search: string = '') => {
    return fetch(`https://api.github.com/search/users?q=${search}`)
        .then(r => r.json())
        .then(({ items }: Response) => items as UserType[])
}
```

**Better:**
```ts
export const userFetcher = async (search = '', signal?: AbortSignal): Promise<UserType[]> => {
    const url = new URL('https://api.github.com/search/users')
    url.searchParams.set('q', search)
    url.searchParams.set('per_page', '30')

    const res = await fetch(url.toString(), { signal })
    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
    }
    const json: GitHubUserSearchResponse = await res.json()
    return json.items
}
```

---

### 23. The test file is a trivial placeholder with no real tests

**File:** `src/vitest.spec.tsx`

```tsx
describe('Testing Harness', () => {
    it('should test', () => {
        const x = 5
        expect(x).toBe(5)
    });
});
```

This test verifies that `5 === 5`. It will never fail. It provides exactly zero confidence in any part of the application. It is not a test — it is a scaffolding leftover that should be replaced immediately. The `filterBotAccounts` function is a perfect starting candidate for unit tests since it is a pure function with clear inputs and outputs. The `userFetcher` function should be tested with a mocked `fetch`. The `Search` component should be tested with React Testing Library for user interactions.

**Minimum viable test additions:**
```tsx
// filterContent.test.ts
import { filterBotAccounts } from '../lib/filterContent'

describe('filterBotAccounts', () => {
    it('removes users with [bot] in their login', () => {
        const input = [
            { id: 1, login: 'dependabot[bot]', avatar_url: '', html_url: '', score: 1 },
            { id: 2, login: 'torvalds', avatar_url: '', html_url: '', score: 1 },
        ]
        expect(filterBotAccounts(input)).toEqual([input[1]])
    })

    it('removes users whose login ends with -bot', () => {
        const input = [{ id: 1, login: 'renovate-bot', avatar_url: '', html_url: '', score: 1 }]
        expect(filterBotAccounts(input)).toHaveLength(0)
    })

    it('is case-insensitive', () => {
        const input = [{ id: 1, login: 'Github-BOT', avatar_url: '', html_url: '', score: 1 }]
        expect(filterBotAccounts(input)).toHaveLength(0)
    })

    it('passes through regular user accounts', () => {
        const input = [{ id: 1, login: 'gaearon', avatar_url: '', html_url: '', score: 1 }]
        expect(filterBotAccounts(input)).toHaveLength(1)
    })
})
```

---

### 24. `DisplayProps` duplicates `UserType` fields instead of reusing the type

**File:** `src/Components/Display.tsx`

```tsx
interface DisplayProps {
    login: string
    avatar_url: string
    html_url: string
    score: number
}
```

This is a manual copy of the fields from `UserType`. If `UserType` changes — for example when `id` is added per Issue 8 — `DisplayProps` will silently diverge. TypeScript provides utilities to avoid this kind of duplication.

**Bad:**
```tsx
interface DisplayProps {
    login: string
    avatar_url: string
    html_url: string
    score: number
}
```

**Better:**
```tsx
// Reuse the type directly, or use Pick if you want to be explicit about what Display needs
type DisplayProps = Pick<UserType, 'id' | 'login' | 'avatar_url' | 'html_url' | 'score'>

// Or simply:
type DisplayProps = UserType
```

---

### 25. Build tools listed in `dependencies` instead of `devDependencies`

**File:** `package.json`

```json
"dependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vitest": "^1.0.1",
    ...
}
```

`@vitejs/plugin-react` and `vitest` are build and test tools. They are never needed at runtime — they are only used during local development and CI builds. Listing them in `dependencies` means they get installed in production environments (e.g., on a Node server, in a Docker container running `npm install --omit=dev`) and inflate the production dependency tree unnecessarily. Build tools, test runners, linters, type definitions, and code formatters all belong in `devDependencies`.

**Bad:**
```json
"dependencies": {
    "next": "14.0.4",
    "react": "^18",
    "react-dom": "^18",
    "@vitejs/plugin-react": "^4.2.1",
    "vitest": "^1.0.1"
}
```

**Better:**
```json
"dependencies": {
    "next": "14.0.4",
    "react": "^18",
    "react-dom": "^18"
},
"devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vitest": "^1.0.1",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "eslint": "^8",
    "eslint-config-next": "14.0.4"
}
```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | High | `Search.tsx` | God Component — extract `useUserSearch` hook |
| 2 | High | `page.tsx`, `Search.tsx` | `'use client'` too high — initial fetch should be server-side |
| 3 | High | `getUsers.ts` | Direct browser-to-GitHub API — rate limited, unauthenticated, no caching |
| 4 | High | `Search.tsx` | No URL state — search not shareable or bookmarkable |
| 5 | Medium | `Results.tsx` | Bot filtering in a display component — belongs at API layer |
| 6 | Medium | `Results.tsx` | `'use client'` with no hooks or handlers — unnecessary client boundary |
| 7 | Medium | `src/Components/` | Inconsistent casing — `Components/` vs `app/` — Linux deploy risk |
| 8 | Medium | `types.ts` | `id` field returned by API but missing from `UserType` |
| 9 | High | `Results.tsx` | `key={i}` — index key causes incorrect reconciliation after sort |
| 10 | High | `Results.tsx` | `data.sort()` mutates prop array in place |
| 11 | Medium | `Results.tsx` | Manual `for` loop instead of `.filter()`; `.match()` instead of `.test()` |
| 12 | Low | `Results.tsx` | Sort + filter not memoized — recalculates on every render |
| 13 | High | `Search.tsx` | No `AbortController` — stale fetch sets state after unmount or new query |
| 14 | Medium | `Search.tsx` | `isLoading` starts as `true` — shows loading state before any search |
| 15 | High | `Search.tsx` | `error` never reset — stale error shown after successful retry |
| 16 | Medium | `Display.tsx` | `<img>` with ESLint-disable instead of Next.js `<Image>` |
| 17 | Low | `Search.tsx` | `<p>&nbsp;</p>` as spacer — semantic HTML abuse |
| 18 | Low | `Search.tsx`, `Results.tsx`, `Display.tsx` | All inline styles — no CSS Modules, no pseudo-selectors |
| 19 | Low | `Search.tsx` | `<button>` missing `type="button"` |
| 20 | High | `getUsers.ts` | Search string not `encodeURIComponent`-encoded — breaks queries with special characters |
| 21 | Medium | `types.ts` | `Response` shadows the global Web API type |
| 22 | High | `getUsers.ts` | No `r.ok` check — silently swallows HTTP 4xx/5xx errors |
| 23 | High | `vitest.spec.tsx` | Placeholder test — no real coverage exists |
| 24 | Low | `Display.tsx` | `DisplayProps` duplicates `UserType` — use `Pick` or type alias |
| 25 | Low | `package.json` | Build tools in `dependencies` instead of `devDependencies` |
