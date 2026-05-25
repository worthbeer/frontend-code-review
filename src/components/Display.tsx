import Image from 'next/image'
import { UserType } from '../types'
import styles from './Display.module.css'

type DisplayProps = Pick<UserType, 'id' | 'login' | 'avatar_url' | 'html_url' | 'score'>

const Display = ({ login, avatar_url, html_url, score }: DisplayProps) => {
    return (
        <div className={styles.card}>
            <Image
                src={avatar_url}
                alt={login}
                width={80}
                height={80}
                className={styles.avatar}
            />
            <h3 className={styles.login}>{login}</h3>
            <p className={styles.score}>Score: {score.toFixed(2)}</p>
            <a href={html_url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                View Profile
            </a>
        </div>
    )
}

export default Display
