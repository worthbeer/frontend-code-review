'use client'

import { UserType } from '../types'
import Display from './Display'

interface ResultsProps {
    isLoading: boolean
    data: UserType[]
}

const filterBotAccounts = (data: UserType[]) => {
    const filteredData: UserType[] = []
    for(let i = 0; i < data.length; i++) {
        if(!data[i].login.match(/\[bot\]|-bot$/i)) {
            filteredData.push(data[i])
        }
    }
    return filteredData
}

const Results = ({ isLoading, data }: ResultsProps): JSX.Element => {
    if(isLoading) return <></>
    let sanitizedData = filterBotAccounts(
        data.sort((a: UserType, b: UserType) => b.score - a.score)
    )
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1em', marginTop: '1em' }}>
            {sanitizedData.map((user, i) =>
                <Display key={i} {...user} />
            )}
        </div>
    )
}

export default Results
