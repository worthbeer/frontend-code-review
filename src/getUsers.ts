import { UserType } from './types'

export const userFetcher = async (search = '', signal?: AbortSignal): Promise<UserType[]> => {
    const res = await fetch(`/api/users?q=${encodeURIComponent(search)}`, { signal })
    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
}
