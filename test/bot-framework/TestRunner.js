/**
 * TestRunner — Orchestrates bot test scenarios.
 *
 * Creates a bedrockflayer bot, wraps it with BotInspector,
 * runs a scenario (sequence of steps), and produces all reports.
 *
 * Usage:
 *   const runner = new TestRunner(scenario)
 *   const result = await runner.run()
 *   console.log(result.summary)
 */

const path = require('path')
const fs = require('fs')
const { createBot } = require('../../index')
const { BotInspector } = require('./BotInspector')
const { liveConsole, saveJSONTrace, generateAISummary, logLiveEvent } = require('./reporter')

class TestRunner {
    /**
     * @param {object} scenario
     * @param {string} scenario.name — test scenario name
     * @param {object} [scenario.botConfig] — bedrockflayer createBot() options
     * @param {object} [scenario.expected] — key-value expectations to verify
     * @param {Function} [scenario.setup] — async (bot, inspector) => void
     * @param {Function[]} [scenario.steps] — array of async (bot, inspector) => void
     * @param {Function} [scenario.teardown] — async (bot, inspector) => void
     * @param {Function} [scenario.verify] — async (inspector) => { passed, details }
     * @param {object} [options]
     * @param {boolean} [options.live=true] — show events in real-time
     * @param {boolean} [options.saveTrace=true] — save JSON trace
     * @param {string} [options.traceDir='test/bot-framework/traces'] — trace output dir
     * @param {number} [options.timeout=120000] — max test duration in ms
     * @param {boolean} [options.printSummary=false] — print summary after run
     */
    constructor(scenario, options = {}) {
        this.scenario = scenario
        this.bot = null
        this.inspector = null
        this._options = {
            live: true,
            saveTrace: true,
            traceDir: path.resolve(__dirname, 'traces'),
            timeout: 120000,
            printSummary: false,
            verbose: false,
            ...options,
        }
        this.result = null
    }

    async run() {
        const { scenario, _options } = this
        const startTime = Date.now()

        const botConfig = {
            host: 'localhost',
            port: 19132,
            username: `TestBot_${scenario.name || 'test'}`,
            offline: true,
            logErrors: false,
            hideErrors: true,
            ...scenario.botConfig,
        }

        console.log(`\n${'='.repeat(60)}`)
        console.log(`  TEST: ${scenario.name || 'unnamed'}`)
        console.log(`  TARGET: ${botConfig.host}:${botConfig.port}`)
        console.log(`  BOT: ${botConfig.username}`)
        console.log(`${'='.repeat(60)}\n`)

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this._cleanup()
                const err = new Error(`Test timed out after ${_options.timeout}ms`)
                this.result = { passed: false, error: err.message, duration: Date.now() - startTime }
                resolve(this.result)
            }, _options.timeout)

            try {
                this.bot = createBot(botConfig)
            } catch (err) {
                clearTimeout(timeoutId)
                this.result = { passed: false, error: err.message, duration: Date.now() - startTime }
                resolve(this.result)
                return
            }

            const inspectorOpts = {
                logPositionEveryTick: false,
                logStateDeltas: true,
                logInventoryChanges: true,
                logEntityEvents: true,
                logPathfinding: true,
                verbose: false,
            }
            this.inspector = new BotInspector(this.bot, inspectorOpts)

            if (_options.live) {
                logLiveEvent(this.inspector)
            }

            this.bot.on('spawn', async () => {
                this.inspector.warn = (msg) => {
                    if (_options.verbose) console.log(`  ⚠️  ${msg}`)
                }
                this.inspector._log = this.inspector._log

                try {
                    if (scenario.setup) {
                        console.log(`  📋 Running setup...`)
                        await scenario.setup(this.bot, this.inspector)
                    }

                    if (scenario.steps && scenario.steps.length > 0) {
                        console.log(`  🏃 Running ${scenario.steps.length} step(s)...`)
                        for (let i = 0; i < scenario.steps.length; i++) {
                            console.log(`  📍 Step ${i + 1}/${scenario.steps.length}`)
                            const stepStart = Date.now()
                            await scenario.steps[i](this.bot, this.inspector)
                            const stepDuration = Date.now() - stepStart
                            if (_options.verbose) {
                                console.log(`     (took ${stepDuration}ms)`)
                            }
                        }
                    }

                    if (scenario.verify) {
                        console.log(`  🔍 Running custom verification...`)
                        const verifyResult = await scenario.verify(this.inspector)
                        if (verifyResult && !verifyResult.passed) {
                            this.inspector.warn(`Custom verification failed: ${verifyResult.details || 'unknown'}`)
                        }
                    }
                } catch (err) {
                    this.inspector._log('test_error', { message: err.message, stack: err.stack?.split('\n').slice(0, 3).join('\n') })
                    console.log(`  ❌ Step error: ${err.message}`)
                }

                try {
                    if (scenario.teardown) {
                        console.log(`  🧹 Running teardown...`)
                        await scenario.teardown(this.bot, this.inspector)
                    }
                } catch (err) {
                    console.log(`  ⚠️  Teardown error: ${err.message}`)
                }

                await this._finalize(startTime, timeoutId, resolve)
            })

            this.bot.on('kicked', (reason) => {
                console.log(`  🚫 Kicked: ${reason}`)
                if (this.inspector) {
                    this.inspector.warn(`Kicked from server: ${reason}`)
                }
                this._finalize(startTime, timeoutId, resolve).catch(() => {})
            })

            this.bot.on('end', (reason) => {
                console.log(`  🔴 Disconnected: ${reason}`)
                this._finalize(startTime, timeoutId, resolve).catch(() => {})
            })

            this.bot.on('error', (err) => {
                console.log(`  💥 Error: ${err.message}`)
                if (this.inspector) {
                    this.inspector._log('bot_error', { message: err.message })
                }
            })
        })
    }

    async _finalize(startTime, timeoutId, resolve) {
        clearTimeout(timeoutId)

        const duration = Date.now() - startTime

        if (this.inspector) {
            this.inspector.stop()
        }

        let passed = true
        const details = []

        const spawned = !!this.inspector?.findFirstEvent('spawn')
        if (!spawned) {
            passed = false
            details.push('Bot did not spawn')
        }

        const hasErrors = this.inspector && this.inspector.errors.length > 0
        if (hasErrors) {
            passed = false
            details.push(`${this.inspector.errors.length} error(s) occurred`)
        }

        if (this.scenario.expected && this.inspector) {
            const { checkExpectation } = require('./reporter')
            for (const [key, expected] of Object.entries(this.scenario.expected)) {
                const result = checkExpectation(this.inspector, key, expected)
                if (!result.passed) {
                    passed = false
                    details.push(result.text)
                }
            }
        }

        if (this.inspector && this._options.saveTrace) {
            try {
                const traceDir = this._options.traceDir
                if (!fs.existsSync(traceDir)) {
                    fs.mkdirSync(traceDir, { recursive: true })
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
                const traceFile = path.join(traceDir, `${this.scenario.name || 'trace'}_${timestamp}.json`)
                await saveJSONTrace(this.inspector, traceFile, { pretty: true })
                console.log(`  📁 Trace saved: ${traceFile}`)
            } catch (err) {
                console.log(`  ⚠️  Failed to save trace: ${err.message}`)
            }
        }

        if (this.inspector && this._options.printSummary) {
            const summary = generateAISummary(this.inspector, this.scenario)
            console.log(summary)
        }

        this.result = {
            name: this.scenario.name || 'unnamed',
            passed,
            duration,
            details,
            inspector: this.inspector,
            bot: this.bot,
        }

        const resultChar = passed ? '✅' : '❌'
        console.log(`\n${'='.repeat(60)}`)
        console.log(`  ${resultChar} RESULT: ${passed ? 'PASSED' : 'FAILED'}`)
        console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)
        if (!passed) {
            console.log(`  Issues:`)
            for (const d of details) {
                console.log(`    - ${d}`)
            }
        }
        console.log(`${'='.repeat(60)}\n`)

        resolve(this.result)
    }

    async disconnect() {
        if (this.bot) {
            try {
                this.bot.end()
            } catch (_) {}
        }
    }

    get summary() {
        return this.result
    }
}

module.exports = { TestRunner }