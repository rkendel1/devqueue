import { readFileSync, writeFileSync } from 'node:fs'
import { parseFlowSpec, validateFlowSpec, flowSpecToManifest } from '@feltdb/core'
const source = readFileSync('feltdb.flow', 'utf8')
const spec = parseFlowSpec(source)
const errors = validateFlowSpec(spec).filter(d => d.severity === 'error')
if (errors.length) throw new Error(JSON.stringify(errors))
writeFileSync('feltdb.contract.json', JSON.stringify(flowSpecToManifest(spec, 'dev-queue', 'dev-queue'), null, 2) + '\n')
