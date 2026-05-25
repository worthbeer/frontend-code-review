export interface UserType {
    id: number
    login: string
    avatar_url: string
    html_url: string
    score: number
}

export interface GitHubUserSearchResponse {
    total_count: number
    incomplete_results: boolean
    items: UserType[]
}
