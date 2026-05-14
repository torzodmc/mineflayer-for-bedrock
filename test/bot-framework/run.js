/**
 * CLI Runner — Run bot behavior tests from the command line.
 *
 * Usage:
 *   node test/bot-framework/run.js smoke
 *   node test/bot-framework/run.js smoke --host=192.168.1.100 --port=19133 --timeout=60000
 *   node test/bot-framework/run.js --file=./my_scenario.js
 *   node test/bot-framework/run.js all
 *   node test/bot-framework/run.js list
 */

const { runByName, runAll, loadScenario, runScenario } = require('./index')

const args = process.argv.slice(2)
let command = null
const options = {
    live: true,
    saveTrace: true,
    printSummary: true,
    timeout: 120000,
    verbose: false,
    botConfig: {},
}

for (const arg of args) {
    if (arg.startsWith('--host=')) {
        options.botConfig.host = arg.slice(7)
    } else if (arg.startsWith('--port=')) {
        options.botConfig.port = parseInt(arg.slice(7), 10)
    } else if (arg.startsWith('--timeout=')) {
        options.timeout = parseInt(arg.slice(10), 10)
    } else if (arg.startsWith('--file=')) {
        command = 'file'
        options.scenarioFile = arg.slice(7)
    } else if (arg.startsWith('--offline=')) {
        options.botConfig.offline = arg.slice(10) !== 'false'
    } else if (arg.startsWith('--username=')) {
        options.botConfig.username = arg.slice(11)
    } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true
    } else if (arg === '--no-live') {
        options.live = false
    } else if (arg === '--no-save') {
        options.saveTrace = false
    } else if (arg === '--no-summary') {
        options.printSummary = false
    } else if (!command) {
        command = arg
    }
}

async function main() {
    if (!command || command === 'help') {
        console.log(`
bedrockflayer Behavior Test Framework

Usage:
  node run.js <scenario> [options]    Run a specific scenario
  node run.js all                     Run all scenarios
  node run.js list                    List available scenarios
  node run.js --file=<path>           Run a custom scenario from file
  node run.js help                    Show this help

Options:
  --host=<ip>        Server host (default: localhost)
  --port=<num>       Server port (default: 19132)
  --timeout=<ms>     Max test duration in ms (default: 120000)
  --offline=true     Skip Xbox auth (default: true)
  --username=<name>  Bot username
  --verbose, -v      Verbose output
  --no-live          Disable live console
  --no-save          Don't save JSON trace
  --no-summary       Don't print AI summary

Examples:
  node run.js smoke
  node run.js dig --host=192.168.1.100
  node run.js all --verbose --timeout=60000
`)
        process.exit(0)
    }

    if (command === 'list') {
        const fs = require('fs')
        const path = require('path')
        const dir = path.join(__dirname, 'scenarios')
        if (!fs.existsSync(dir)) {
            console.log('No scenarios directory found.')
            process.exit(0)
        }
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
        console.log('\nAvailable scenarios:')
        for (const f of files) {
            const name = path.basename(f, '.js')
            console.log(`  - ${name}`)
        }
        console.log('')
        process.exit(0)
    }

    if (command === 'file') {
        const scenario = require(options.scenarioFile)
        console.log(`\nRunning custom scenario from: ${options.scenarioFile}`)
        const result = await runScenario(scenario, options)
        process.exit(result.passed ? 0 : 1)
    }

    if (command === 'all') {
        const results = await runAll(options)
        const failed = results.filter(r => !r.passed).length
        process.exit(failed > 0 ? 1 : 0)
    }

    try {
        const result = await runByName(command, options)
        process.exit(result.passed ? 0 : 1)
    } catch (err) {
        console.error(`Error: ${err.message}`)
        process.exit(1)
    }
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})