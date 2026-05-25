import { NextRequest, NextResponse } from 'next/server'
import { GitHubUserSearchResponse } from '../../../types'

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q') ?? ''
    if (!q.trim()) return NextResponse.json([])

    const url = new URL('https://api.github.com/search/users')
    url.searchParams.set('q', q)
    url.searchParams.set('per_page', '30')

    const headers: HeadersInit = { Accept: 'application/vnd.github+json' }
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const res = await fetch(url.toString(), {
        headers,
        next: { revalidate: 60 },
    })

    if (!res.ok) {
        return NextResponse.json({ error: 'Upstream error' }, { status: res.status })
    }

    const json: GitHubUserSearchResponse = await res.json()
    return NextResponse.json(json.items)
}
