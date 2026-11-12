/* 用途：核必要Mac三案完整與來源一致，不合併跨平台counter；所在層：CI薄驗證；關聯：platform-plan、harness-ci。 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { assertCompleteRun } from './platform-plan'
import { appFiles, sourceHashes, root } from './instrument'
const [matrix, path, ...extra] = process.argv.slice(2)
assert(matrix === 'mac-pts-selected' && path && !extra.length, '只接受唯一同輪Mac必要三案收據')
const run = JSON.parse(readFileSync(path, 'utf8'))
assertCompleteRun(run, [matrix])
assert.equal(run.trackedChanges, false)
assert.equal(run.sourceHead, Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim())
assert.equal(run.runnerSha256, createHash('sha256').update(readFileSync(resolve(root, 'tests/app-coverage/run-app.ts'))).digest('hex'))
assert.deepEqual(run.appFiles, appFiles); assert.deepEqual(run.sourceHashes, sourceHashes); assert.deepEqual(run.errors, [])
assert.deepEqual(run.cleanup, { browserClosed: true, serverStopped: true, lockRetained: false })
console.log('同來源Mac三案全部真通過；不合併其計數到Linux badge')
