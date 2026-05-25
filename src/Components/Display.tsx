interface DisplayProps {
    login: string
    avatar_url: string
    html_url: string
    score: number
}

const Display = ({ login, avatar_url, html_url, score }: DisplayProps) => {
    return (
        <div style={{ border: '1px solid #d0d7de', padding: '1em', borderRadius: '8px', width: '200px', background: '#f6f8fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5em' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar_url} alt={login} height="80" width="80" style={{ borderRadius: '50%' }} />
            <h3 style={{ fontSize: '1rem', margin: 0 }}>{login}</h3>
            <p style={{ fontSize: '0.75rem', color: '#57606a' }}>Score: {score.toFixed(2)}</p>
            <a href={html_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#0969da' }}>
                View Profile
            </a>
        </div>
    )
}

export default Display
