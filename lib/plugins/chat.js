/**
 * Chat Plugin for bedrockflayer.
 *
 * Handles sending and receiving chat messages, whispers,
 * chat pattern matching, and actionbar/title events.
 */

function chatPlugin(bot) {
    // ---- State ----
    bot.chatPatterns = []
    bot._chatPatternId = 0

    // ---- Packet listeners ----

    bot.client.on('text', (packet) => {
        const type = packet.type || 'chat'
        const sourceName = packet.source_name || ''
        const message = packet.message || ''
        const xuid = packet.xuid || ''
        const needsTranslation = packet.needs_translation || false

        // Build a jsonMsg-like object
        const jsonMsg = {
            type,
            source_name: sourceName,
            message,
            xuid,
            needs_translation: needsTranslation,
            parameters: packet.parameters || [],
            toString() { return message }
        }

        // Emit the universal "message" event for all text packets
        bot.emit('message', jsonMsg, type, sourceName)
        bot.emit('messagestr', message, type, jsonMsg, sourceName)

        // Route to specific event types
        switch (type) {
            case 'chat':
                if (sourceName && sourceName !== bot.username) {
                    const matches = _runChatPatterns(bot, message)
                    bot.emit('chat', sourceName, message, needsTranslation, jsonMsg, matches)
                }
                break

            case 'whisper':
                if (sourceName && sourceName !== bot.username) {
                    const matches = _runChatPatterns(bot, message)
                    bot.emit('whisper', sourceName, message, needsTranslation, jsonMsg, matches)
                }
                break

            case 'tip':
            case 'jukebox_popup':
                bot.emit('actionBar', jsonMsg)
                break

            case 'system':
            case 'announcement':
            case 'json':
                // System messages — just the universal message event
                break

            default:
                break
        }
    })

    // Title packets
    bot.client.on('set_title', (packet) => {
        const type = _parseTitleType(packet.type)
        const text = packet.text || ''

        if (type === 'times') {
            bot.emit('title_times', packet.fade_in_time || 0, packet.stay_time || 0, packet.fade_out_time || 0)
        } else if (type === 'clear' || type === 'reset') {
            bot.emit('title_clear')
        } else {
            bot.emit('title', text, type)
        }
    })

    // ---- Methods injected onto bot ----

    /**
     * Send a public chat message. Auto-splits long messages.
     * @param {string} message
     */
    bot.chat = function (message) {
        if (!message) return
        // Bedrock chat limit is typically 512 characters
        const maxLen = 512
        const parts = _splitMessage(message, maxLen)
        for (const part of parts) {
            bot.client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: bot.username,
                xuid: '',
                platform_chat_id: '',
                filtered_message: '',
                message: part
            })
        }
    }

    /**
     * Send a whisper (private message) via /tell command.
     * @param {string} username
     * @param {string} message
     */
    bot.whisper = function (username, message) {
        bot.chat(`/tell ${username} ${message}`)
    }

    /**
     * Add a chat pattern. When the pattern's regex matches a chat message,
     * a "chat:<name>" event is emitted.
     * @param {string} name - Event name suffix (emits "chat:<name>")
     * @param {RegExp} pattern - Regex to match
     * @param {object} [options] - { repeat: true, parse: false }
     * @returns {number} Pattern ID for removal
     */
    bot.addChatPattern = function (name, pattern, options = {}) {
        const id = ++bot._chatPatternId
        bot.chatPatterns.push({
            id,
            name,
            pattern,
            repeat: options.repeat !== undefined ? options.repeat : true,
            parse: options.parse || false
        })
        return id
    }

    /**
     * Add a set of chat patterns that all must match before emitting.
     * @param {string} name
     * @param {RegExp[]} patterns
     * @param {object} [options]
     * @returns {number} Pattern set ID
     */
    bot.addChatPatternSet = function (name, patterns, options = {}) {
        const id = ++bot._chatPatternId
        bot.chatPatterns.push({
            id,
            name,
            patterns,
            isSet: true,
            matched: [],
            repeat: options.repeat !== undefined ? options.repeat : true,
            parse: options.parse || false
        })
        return id
    }

    /**
     * Remove chat pattern(s) by name (string) or by ID (number).
     * @param {string|number} nameOrId
     */
    bot.removeChatPattern = function (nameOrId) {
        if (typeof nameOrId === 'number') {
            bot.chatPatterns = bot.chatPatterns.filter(p => p.id !== nameOrId)
        } else {
            bot.chatPatterns = bot.chatPatterns.filter(p => p.name !== nameOrId)
        }
    }

    /**
     * Wait for a specific chat message. Returns a Promise.
     * @param {...(string|RegExp|Array)} args - Strings or RegExp patterns to match
     * @returns {Promise<string>}
     */
    bot.awaitMessage = function (...args) {
        // Flatten arrays
        const matchers = args.flat().map(m => {
            if (typeof m === 'string') return (msg) => msg === m
            if (m instanceof RegExp) return (msg) => m.test(msg)
            return () => false
        })

        return new Promise((resolve) => {
            const onMessage = (jsonMsg, _type, _sender) => {
                const msg = jsonMsg.toString()
                for (const matcher of matchers) {
                    if (matcher(msg)) {
                        bot.removeListener('message', onMessage)
                        resolve(msg)
                        return
                    }
                }
            }
            bot.on('message', onMessage)
        })
    }
}

// ---- Internal helpers ----

function _splitMessage(message, maxLen) {
    const parts = []
    for (let i = 0; i < message.length; i += maxLen) {
        parts.push(message.substring(i, i + maxLen))
    }
    return parts.length > 0 ? parts : ['']
}

function _runChatPatterns(bot, message) {
    const allMatches = []
    const toRemove = []

    for (const pattern of bot.chatPatterns) {
        if (pattern.isSet) {
            // Pattern set — all must match sequentially
            for (const p of pattern.patterns) {
                const m = message.match(p)
                if (m) {
                    pattern.matched.push(pattern.parse ? m.slice(1) : m[0])
                }
            }
            if (pattern.matched.length >= pattern.patterns.length) {
                bot.emit(`chat:${pattern.name}`, pattern.matched)
                allMatches.push(...pattern.matched)
                pattern.matched = []
                if (!pattern.repeat) toRemove.push(pattern.id)
            }
        } else {
            // Single pattern
            const m = message.match(pattern.pattern)
            if (m) {
                const result = pattern.parse ? m.slice(1) : m
                bot.emit(`chat:${pattern.name}`, result)
                allMatches.push(result)
                if (!pattern.repeat) toRemove.push(pattern.id)
            }
        }
    }

    // Clean up non-repeating patterns
    for (const id of toRemove) {
        bot.chatPatterns = bot.chatPatterns.filter(p => p.id !== id)
    }

    return allMatches.length > 0 ? allMatches : null
}

function _parseTitleType(type) {
    switch (type) {
        case 0: return 'clear'
        case 1: return 'reset'
        case 2: return 'title'
        case 3: return 'subtitle'
        case 4: return 'actionbar'
        case 5: return 'times'
        default: return 'title'
    }
}

module.exports = chatPlugin
