'use client'

import { useState, useEffect } from 'react'
import Results from '../Components/Results'
import { userFetcher } from '../getUsers'
import { UserType } from '../types'

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

    return (
        <div style={{ padding: '2em', fontFamily: 'sans-serif', maxWidth: '960px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5em' }}>GitHub User Search</h1>
            <p>&nbsp;</p>
            <div style={{ display: 'flex', gap: '0.5em' }}>
                <input
                    value={searchInputValue}
                    onChange={(e) => setSearchInputValue(e.target.value)}
                    placeholder="Search GitHub users..."
                    style={{ padding: '0.5em', width: '300px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <button onClick={() => setSearch(searchInputValue)} style={{ padding: '0.5em 1.2em', fontSize: '1rem', cursor: 'pointer' }}>
                    Search
                </button>
            </div>
            <p>&nbsp;</p>
            {error && <p style={{ color: 'red' }}>Something went wrong. Please try again.</p>}
            <Results isLoading={isLoading} data={data} />
        </div>
    )
}

export default Search
