const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/features/manager/dishes/manual-hot-time.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exportsObject = {}
new Function('exports', compiled)(exportsObject)
const { manualHotInput, manualHotIso } = exportsObject

test('restaurant time round trips independently of device timezone', () => {
	const previous = process.env.TZ
	try {
		for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
			process.env.TZ = zone
			assert.equal(manualHotInput('2026-10-15T12:30:00Z'), '2026-10-15T15:30')
			assert.equal(manualHotIso('2026-10-15T15:30'), '2026-10-15T12:30:00.000Z')
			assert.equal(manualHotIso('2026-10-16T00:00'), '2026-10-15T21:00:00.000Z')
		}
	} finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
test('rejects invalid calendar dates and incomplete input', () => {
	for (const input of ['', '2026-02-30T12:00', '2026-10-15', '2026-10-15T25:00'])
		assert.throws(() => manualHotIso(input))
	assert.equal(manualHotIso('2028-02-29T15:00'), '2028-02-29T12:00:00.000Z')
})
