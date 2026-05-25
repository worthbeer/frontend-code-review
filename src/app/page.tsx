import { Suspense } from 'react'
import SearchShell from './SearchShell'
import { UserType, GitHubUserSearchResponse } from '../types'

async function fetchInitialUsers(query: string): Promise<UserType[]> {
    if (!query.trim()) return []
    const url = new URL('https://api.github.com/search/users')
    url.searchParams.set('q', query)
    url.searchParams.set('per_page', '30')
    const headers: HeadersInit = { Accept: 'application/vnd.github+json' }
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }
    const res = await fetch(url.toString(), { headers, next: { revalidate: 60 } })
    if (!res.ok) return []
    const json: GitHubUserSearchResponse = await res.json()
    return json.items ?? []
}

export default async function Home({ searchParams }: { searchParams: { q?: string } }) {
    const initialQuery = searchParams.q ?? ''
    const initialData = await fetchInitialUsers(initialQuery)
    return (
        <Suspense>
            <SearchShell initialData={initialData} initialQuery={initialQuery} />
        </Suspense>
    )
}
