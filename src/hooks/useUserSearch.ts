import { useState, useEffect } from 'react'
import { UserType } from '../types'
import { userFetcher } from '../getUsers'

export function useUserSearch(query: string) {
    const [data, setData] = useState<UserType[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!query.trim()) {
            setData([])
            return
        }
        const controller = new AbortController()
        setIsLoading(true)
        setError(null)
        userFetcher(query, controller.signal)
            .then(results => { setData(results); setIsLoading(false) })
            .catch(e => {
                if (e.name === 'AbortError') return
                setError('Failed to fetch users. Please try again.')
                setIsLoading(false)
            })
        return () => controller.abort()
    }, [query])

    return { data, isLoading, error }
}
