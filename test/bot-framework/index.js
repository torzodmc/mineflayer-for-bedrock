/**
 * bedrockflayer Bot Test Framework
 *
 * Usage:
 *   // Programmatic
 *   const { TestRunner } = require('./test/bot-framework')
 *   const runner = new TestRunner(myScenario, { live: true, printSummary: true })
 *   const result = await runner.run()
 *   console.log(result.passed ? 'PASS' : 'FAIL')
 *
 *   // CLI
 *   node test/bot-framework/run.js smoke
 *   node test/bot-framework/run.js --file=my_scenario.js
 *   node test/bot-framework/run.js all
 */

const { BotInspector } = require('./BotInspector')
const { TestRunner } = require('./TestRunner')
const {
    liveConsole,
    logLiveEvent,
    saveJSONTrace,
    generateAISummary,
    checkExpectation,
} = require('./reporter')

function loadScenario(name) {
    try {
        return require(`./scenarios/${name}`)
    } catch (e) {
        throw new Error(`Scenario "${name}" not found at scenarios/${name}.js: ${e.message}`)
    }
}

async function runScenario(scenario, options = {}) {
    const mergedOptions = {
        live: true,
        saveTrace: true,
        printSummary: options.printSummary !== undefined ? options.printSummary : true,
        timeout: options.timeout || 120000,
        verbose: options.verbose || false,
        ...options,
    }

    const runner = new TestRunner(scenario, mergedOptions)
    const result = await runner.run()

    if (result.inspector && mergedOptions.printSummary) {
        const summary = generateAISummary(result.inspector, scenario)
        console.log(summary)
    }

    return result
}

async function runByName(scenarioName, options = {}) {
    const scenario = loadScenario(scenarioName)
    return runScenario(scenario, { ...options, botConfig: scenario.botConfig || options.botConfig })
}

async function runAll(options = {}) {
    const fs = require('fs')
    const path = require('path')
    const scenariosDir = path.join(__dirname, 'scenarios')
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.js'))

    const results = []
    for (const file of files) {
        const name = path.basename(file, '.js')
        try {
            const result = await runByName(name, options)
            results.push(result)
        } catch (err) {
            console.error(`  ❌ Scenario "${name}" error: ${err.message}`)
            results.push({ name, passed: false, error: err.message })
        }
    }

    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  ALL SCENARIOS: ${passed} passed, ${failed} failed`)
    console.log(`${'='.repeat(60)}\n`)

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌'
        console.log(`  ${icon} ${r.name}: ${r.passed ? 'PASS' : 'FAIL'} ${r.details?.join(', ') || ''}`)
    }

    return results
}

module.exports = {
    BotInspector,
    TestRunner,
    liveConsole,
    logLiveEvent,
    saveJSONTrace,
    generateAISummary,
    checkExpectation,
    loadScenario,
    runScenario,
    runByName,
    runAll,
}