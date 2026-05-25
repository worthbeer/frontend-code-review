import { UserType } from '../types'
import { filterBotAccounts } from '../lib/filterContent'
import Display from './Display'
import styles from './Results.module.css'

interface ResultsProps {
    isLoading: boolean
    data: UserType[]
}

const Results = ({ isLoading, data }: ResultsProps) => {
    if (isLoading) return null
    const sorted = [...data].sort((a, b) => b.score - a.score)
    const sanitizedData = filterBotAccounts(sorted)
    return (
        <div className={styles.grid}>
            {sanitizedData.map(user =>
                <Display key={user.id} {...user} />
            )}
        </div>
    )
}

export default Results
