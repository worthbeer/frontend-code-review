import { Response, UserType } from './types'

export const userFetcher = async (search: string = '') => {
    return fetch(`https://api.github.com/search/users?q=${search}`)
        .then(r => r.json())
        .then(({ items }: Response) => items as UserType[])
}
