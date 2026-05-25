export interface UserType {
    login: string
    avatar_url: string
    html_url: string
    score: number
}

export interface Response {
    total_count: number
    incomplete_results: boolean
    items: UserType[]
}

export interface Pagination {
    total_count: number
    incomplete_results: boolean
}
