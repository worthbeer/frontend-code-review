import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'GitHub User Search',
    description: 'Search for GitHub users by username',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
