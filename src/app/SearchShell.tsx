'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserSearch } from '../hooks/useUserSearch'
import Results from '../components/Results'
import { UserType } from '../types'
import styles from './Search.module.css'

interface SearchShellProps {
    initialData: UserType[]
    initialQuery: string
}

export default function SearchShell({ initialData, initialQuery }: SearchShellProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const query = searchParams.get('q') ?? initialQuery
    const [inputValue, setInputValue] = useState(query)

    const { data, isLoading, error } = useUserSearch(query)

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const params = new URLSearchParams(searchParams.toString())
        if (inputValue.trim()) params.set('q', inputValue.trim())
        else params.delete('q')
        router.push(`?${params.toString()}`)
    }

    const displayData = data.length > 0 ? data : initialData

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>GitHub User Search</h1>
            <form className={styles.form} onSubmit={handleSearch}>
                <input
                    className={styles.input}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder="Search GitHub users..."
                />
                <button type="submit" className={styles.button}>Search</button>
            </form>
            {error && <p className={styles.error}>{error}</p>}
            <Results isLoading={isLoading} data={displayData} />
        </div>
    )
}
