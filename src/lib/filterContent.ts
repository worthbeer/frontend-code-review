import { UserType } from '../types'

export const filterBotAccounts = (data: UserType[]): UserType[] =>
    data.filter(user => !/(\[bot\]|-bot$)/i.test(user.login))
