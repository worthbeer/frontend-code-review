import { describe, it, expect } from 'vitest'
import { filterBotAccounts } from './lib/filterContent'
import { UserType } from './types'

const makeUser = (id: number, login: string): UserType => ({
    id,
    login,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}`,
    html_url: `https://github.com/${login}`,
    score: 1,
})

describe('filterBotAccounts', () => {
    it('removes users with [bot] in their login', () => {
        const input = [makeUser(1, 'dependabot[bot]'), makeUser(2, 'torvalds')]
        expect(filterBotAccounts(input)).toEqual([input[1]])
    })

    it('removes users whose login ends with -bot', () => {
        const input = [makeUser(1, 'renovate-bot')]
        expect(filterBotAccounts(input)).toHaveLength(0)
    })

    it('is case-insensitive', () => {
        const input = [makeUser(1, 'Github-BOT'), makeUser(2, 'myapp[BOT]')]
        expect(filterBotAccounts(input)).toHaveLength(0)
    })

    it('passes through regular user accounts', () => {
        const input = [makeUser(1, 'gaearon'), makeUser(2, 'sindresorhus')]
        expect(filterBotAccounts(input)).toHaveLength(2)
    })

    it('does not remove a user whose login contains "robot" (not "-bot")', () => {
        const input = [makeUser(1, 'robotics-fan')]
        expect(filterBotAccounts(input)).toHaveLength(1)
    })

    it('returns an empty array when input is empty', () => {
        expect(filterBotAccounts([])).toEqual([])
    })
})
