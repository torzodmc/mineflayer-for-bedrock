/**
 * Unit tests for the chat plugin's internal logic.
 * These tests do NOT require a real server connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from 'events'
import chatPlugin from '../../lib/plugins/chat.js'

function createMockBot() {
    const bot = new EventEmitter()
    bot.username = 'TestBot'
    bot.client = new EventEmitter()
    bot.client.queue = vi.fn()
    chatPlugin(bot)
    return bot
}

describe('Chat Plugin', () => {
    let bot

    beforeEach(() => {
        bot = createMockBot()
    })

    describe('bot.chat()', () => {
        it('should send a text packet when bot.chat is called', () => {
            bot.chat('Hello world')
            expect(bot.client.queue).toHaveBeenCalledWith('text', expect.objectContaining({
                type: 'chat',
                message: 'Hello world',
                source_name: 'TestBot'
            }))
        })

        it('should split long messages into chunks', () => {
            const longMsg = 'a'.repeat(1024)
            bot.chat(longMsg)
            expect(bot.client.queue).toHaveBeenCalledTimes(2) // 1024 / 512 = 2
        })

        it('should handle empty strings gracefully', () => {
            bot.chat('')
            expect(bot.client.queue).not.toHaveBeenCalled()
        })
    })

    describe('bot.whisper()', () => {
        it('should send a /tell command', () => {
            bot.whisper('Steve', 'hey there')
            expect(bot.client.queue).toHaveBeenCalledWith('text', expect.objectContaining({
                message: '/tell Steve hey there'
            }))
        })
    })

    describe('Chat event emission', () => {
        it('should emit "chat" when a player sends a message', () => {
            const chatHandler = vi.fn()
            bot.on('chat', chatHandler)

            bot.client.emit('text', {
                type: 'chat',
                source_name: 'Steve',
                message: 'Hello bot!'
            })

            expect(chatHandler).toHaveBeenCalled()
            const chatArgs = chatHandler.mock.calls[0]
            expect(chatArgs[0]).toBe('Steve')
            expect(chatArgs[1]).toBe('Hello bot!')
            expect(chatArgs[2]).toBe(false)
        })

        it('should NOT emit "chat" for own messages', () => {
            const chatHandler = vi.fn()
            bot.on('chat', chatHandler)

            bot.client.emit('text', {
                type: 'chat',
                source_name: 'TestBot',
                message: 'My own message'
            })

            expect(chatHandler).not.toHaveBeenCalled()
        })

        it('should emit "whisper" for whisper type messages', () => {
            const whisperHandler = vi.fn()
            bot.on('whisper', whisperHandler)

            bot.client.emit('text', {
                type: 'whisper',
                source_name: 'Steve',
                message: 'Secret message'
            })

            expect(whisperHandler).toHaveBeenCalled()
            const whisperArgs = whisperHandler.mock.calls[0]
            expect(whisperArgs[0]).toBe('Steve')
            expect(whisperArgs[1]).toBe('Secret message')
            expect(whisperArgs[2]).toBe(false)
        })

        it('should emit "message" for all text packets', () => {
            const msgHandler = vi.fn()
            bot.on('message', msgHandler)

            bot.client.emit('text', {
                type: 'system',
                source_name: '',
                message: 'Server restarting...'
            })

            expect(msgHandler).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Server restarting...' }),
                'system',
                ''
            )
        })

        it('should emit "actionBar" for tip messages', () => {
            const actionBarHandler = vi.fn()
            bot.on('actionBar', actionBarHandler)

            bot.client.emit('text', {
                type: 'tip',
                source_name: '',
                message: 'You found a diamond!'
            })

            expect(actionBarHandler).toHaveBeenCalled()
        })
    })

    describe('Chat patterns', () => {
        it('should emit "chat:<name>" when a pattern matches', () => {
            const handler = vi.fn()
            bot.addChatPattern('greeting', /^hello (.+)$/, { parse: true })
            bot.on('chat:greeting', handler)

            bot.client.emit('text', {
                type: 'chat',
                source_name: 'Steve',
                message: 'hello world'
            })

            expect(handler).toHaveBeenCalledWith(['world'])
        })

        it('should remove non-repeating patterns after first match', () => {
            const handler = vi.fn()
            bot.addChatPattern('once', /^test$/, { repeat: false })
            bot.on('chat:once', handler)

            bot.client.emit('text', { type: 'chat', source_name: 'Steve', message: 'test' })
            expect(handler).toHaveBeenCalledTimes(1)

            bot.client.emit('text', { type: 'chat', source_name: 'Steve', message: 'test' })
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('should remove patterns by name', () => {
            bot.addChatPattern('myPattern', /test/)
            expect(bot.chatPatterns.length).toBe(1)
            bot.removeChatPattern('myPattern')
            expect(bot.chatPatterns.length).toBe(0)
        })

        it('should remove patterns by ID', () => {
            const id = bot.addChatPattern('myPattern', /test/)
            expect(bot.chatPatterns.length).toBe(1)
            bot.removeChatPattern(id)
            expect(bot.chatPatterns.length).toBe(0)
        })
    })

    describe('bot.awaitMessage()', () => {
        it('should resolve when a matching message is received', async () => {
            const promise = bot.awaitMessage('hello world')

            setTimeout(() => {
                bot.client.emit('text', {
                    type: 'chat',
                    source_name: 'Steve',
                    message: 'hello world'
                })
            }, 10)

            const result = await promise
            expect(result).toBe('hello world')
        })

        it('should support regex matching', async () => {
            const promise = bot.awaitMessage(/^welcome (.+)/)

            setTimeout(() => {
                bot.client.emit('text', {
                    type: 'system',
                    source_name: '',
                    message: 'welcome player123'
                })
            }, 10)

            const result = await promise
            expect(result).toBe('welcome player123')
        })
    })

    describe('Title events', () => {
        it('should emit "title" for title packets', () => {
            const handler = vi.fn()
            bot.on('title', handler)

            bot.client.emit('set_title', {
                type: 2,
                text: 'Welcome!'
            })

            expect(handler).toHaveBeenCalledWith('Welcome!', 'title')
        })

        it('should emit "title_clear" for clear packets', () => {
            const handler = vi.fn()
            bot.on('title_clear', handler)

            bot.client.emit('set_title', { type: 0 })

            expect(handler).toHaveBeenCalled()
        })
    })
})
