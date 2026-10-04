import test from 'node:test'
import assert from 'node:assert/strict'
import { selectNext } from '../lib/queue-selection.ts'
const item = (id, priority, status = 'queued', dependencies = []) => ({ id: String(id), number: id, priority, status, dependencies })
test('human persisted priority wins over input order and number', () => assert.equal(selectNext([item(1, 2), item(2, 0)]).number, 2))
test('incomplete and unknown dependencies are skipped', () => assert.equal(selectNext([item(1, 0, 'queued', ['#3']), item(2, 1), item(3, 2, 'running')]).number, 2))
test('done dependency unlocks work', () => assert.equal(selectNext([item(1, 0, 'queued', ['#3']), item(3, 1, 'done')]).number, 1))
test('no executable work returns null', () => assert.equal(selectNext([item(1, 0, 'waiting'), item(2, 1, 'queued', ['missing'])]), null))
test('selection never mutates queue', () => { const queue = [item(1, 2), item(2, 0)]; selectNext(queue); assert.equal(queue[0].number, 1) })
