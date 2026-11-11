'use strict';
// Guard for Rule 23 / 23.8 / 23.9 (shared-fix5): every model v2 code uses registers a 'v2-'
// name and a 'v2-' collection, v2 code reaches no legacy model except the allowed read-only
// `device` (WDMS terminal serials), and every helper/service/script/test that wraps a v2 model
// is named 'v2-…'. Static: walks the require() graph from every v2 entry point and loads only
// model files — no DB, no Redis, no route file is executed.
// Run: node scripts/v2-test-model-names.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'modules', 'models');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

// Legacy model v2 code may read (Rule 23.4). Keeps its legacy name on purpose.
const ALLOWED_LEGACY = new Set(['modules/models/devices/device.js']);

// Rule 23.7 finished the move: nothing else is allowed. Any legacy import from v2 code fails.
const KNOWN_LEGACY = new Set();

// Rule 23.9: wrapper files that are deliberately NOT v2-named (each with its reason).
const WRAPPER_NAME_EXEMPT = new Set([
    'scripts/migrate-v2-collection-names.js', // name fixed by shared-fix5 Rule 23.8.3
]);

// One-time legacy -> v2 copy script: reads the legacy `student` collection by design (it is the
// bridge, not v2 runtime code). Listed for the owner in shared-fix5.md "Still on legacy".
const LEGACY_BRIDGE_SCRIPTS = new Set(['scripts/v2-migrate-students.js']);

// --- require graph -------------------------------------------------------------------------
const allFiles = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'public') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) allFiles.push(p);
    }
})(ROOT);

const depsCache = new Map();
const depsOf = (file) => {
    if (depsCache.has(file)) return depsCache.get(file);
    const src = fs.readFileSync(file, 'utf8');
    const out = [];
    const re = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
        if (!m[1].startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), m[1]);
        const hit = [base, `${base}.js`, path.join(base, 'index.js')].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
        if (hit) out.push(hit);
    }
    depsCache.set(file, out);
    return out;
};

const v2Roots = () => {
    const roots = [];
    const routes = fs.readFileSync(path.join(ROOT, 'routes.js'), 'utf8');
    for (const line of routes.split('\n')) {
        const m = line.match(/app\.use\('(\/api\/v2[^']*)',\s*require\('([^']+)'\)/);
        if (m && !line.trim().startsWith('//')) roots.push(path.resolve(ROOT, m[2]) + '.js');
    }
    const workers = ['student-worker', 'attendance-v2-worker', 'payroll-worker', 'fees-worker', 'examination-worker'];
    workers.forEach((w) => roots.push(path.join(ROOT, 'modules', 'workers', `${w}.js`)));
    allFiles.filter((f) => /[\\/]services[\\/](attendance-v2|payroll)[\\/]/.test(f)).forEach((f) => roots.push(f));
    return roots.filter((f) => fs.existsSync(f));
};

// `stop`: files not followed (a test that boots the whole app via routes.js/app.js also loads
// the v1 routers — that is the app, not the test importing a legacy model).
const reach = (roots, stop = new Set()) => {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const f = stack.pop();
        if (seen.has(f)) continue;
        seen.add(f);
        if (stop.has(f)) continue;
        depsOf(f).forEach((d) => stack.push(d));
    }
    return seen;
};

const roots = v2Roots();
const v2Graph = reach(roots);
const isModelFile = (f) => f.startsWith(MODELS_DIR + path.sep);
const v2Models = [...v2Graph].filter(isModelFile).map(rel).sort();

// --- model registry ------------------------------------------------------------------------
const modelFiles = allFiles.filter(isModelFile);
const registry = new Map(); // rel file -> { modelName, collection, schema }
for (const f of modelFiles) {
    try {
        const model = require(f);
        if (model && model.modelName) registry.set(rel(f), { modelName: model.modelName, collection: model.collection.collectionName, schema: model.schema });
    } catch (error) {
        // models/payment.js and models/customer-payment.js both claim 'Payment' (legacy, untouched).
        if (v2Models.includes(rel(f))) throw error;
    }
}
const legacyCollections = new Set([...registry.entries()]
    .filter(([file, r]) => !r.modelName.startsWith('v2-') && !v2Models.includes(file))
    .map(([, r]) => r.collection));

const isLegacyExempt = (file) => ALLOWED_LEGACY.has(file) || KNOWN_LEGACY.has(file);

const tests = {
    'v2 entry points were found (routes.js /api/v2 mounts + v2 workers)': () => {
        assert.ok(roots.length >= 20, `only ${roots.length} v2 roots found`);
        assert.ok(v2Models.length >= 40, `only ${v2Models.length} models reached from v2 code`);
    },
    'every model v2 code reaches registers a v2- name (or is the allowed legacy read)': () => {
        const bad = v2Models.filter((f) => !isLegacyExempt(f) && !registry.get(f).modelName.startsWith('v2-'))
            .map((f) => `${f} -> '${registry.get(f).modelName}'`);
        assert.deepStrictEqual(bad, [], `v2 models without the v2- prefix, or legacy imports from v2 code:\n  ${bad.join('\n  ')}`);
    },
    'v2 code reaches no legacy model except the read-only device': () => {
        assert.strictEqual(KNOWN_LEGACY.size, 0, 'KNOWN_LEGACY must stay empty');
        const legacyReached = v2Models.filter((f) => !registry.get(f).modelName.startsWith('v2-'));
        const unexpected = legacyReached.filter((f) => !isLegacyExempt(f));
        assert.deepStrictEqual(unexpected, [], `legacy model imported by v2 code: ${unexpected.join(', ')}`);
    },
    'v2 scripts and tests import no legacy model except device': () => {
        const scriptRoots = allFiles.filter((f) => /^scripts\/v2-/.test(rel(f)) && !LEGACY_BRIDGE_SCRIPTS.has(rel(f)));
        assert.ok(scriptRoots.length >= 20, `only ${scriptRoots.length} v2 scripts found`);
        const appEntry = new Set([path.join(ROOT, 'routes.js'), path.join(ROOT, 'app.js')]);
        const bad = [...reach(scriptRoots, appEntry)].filter(isModelFile).map(rel)
            .filter((f) => registry.has(f) && !registry.get(f).modelName.startsWith('v2-') && !isLegacyExempt(f));
        assert.deepStrictEqual(bad, [], `legacy model imported by a v2 script: ${bad.join(', ')}`);
    },
    'every helper/service/script that wraps a v2 model is v2-named': () => {
        const v2ModelFiles = new Set([...registry.entries()].filter(([, r]) => r.modelName.startsWith('v2-')).map(([f]) => f));
        const bad = allFiles
            .filter((f) => /^(modules\/(helpers|services)|scripts)\//.test(rel(f)))
            .filter((f) => depsOf(f).some((d) => v2ModelFiles.has(rel(d))))
            .filter((f) => !path.basename(f).startsWith('v2-') && !WRAPPER_NAME_EXEMPT.has(rel(f)))
            .map(rel);
        assert.deepStrictEqual(bad, [], `wraps a v2 model but is not v2-named: ${bad.join(', ')}`);
    },
    'every model file in a v2 module folder registers a v2- name': () => {
        const legacyFolders = new Set(['devices', 'users', 'whatsapp-message']);
        const bad = [...registry.entries()]
            .filter(([file]) => { const parts = file.split('/'); return parts.length > 3 && !legacyFolders.has(parts[2]); })
            .filter(([, r]) => !r.modelName.startsWith('v2-'))
            .map(([file, r]) => `${file} -> '${r.modelName}'`);
        assert.deepStrictEqual(bad, [], bad.join('\n'));
    },
    'v2 models never share a collection with a legacy model': () => {
        const bad = [...registry.entries()]
            .filter(([, r]) => r.modelName.startsWith('v2-') && legacyCollections.has(r.collection))
            .map(([file, r]) => `${file} -> ${r.collection}`);
        assert.deepStrictEqual(bad, [], `points at legacy: ${bad.join(', ')}`);
    },
    'every v2 model uses a v2- collection (Rule 23.8)': () => {
        const bad = [...registry.values()]
            .filter((r) => r.modelName.startsWith('v2-') && !r.collection.startsWith('v2-'))
            .map((r) => `${r.modelName} -> ${r.collection}`);
        assert.deepStrictEqual(bad, [], bad.join(', '));
    },
    'migrated models point at the renamed v2- collections': () => {
        const expect = {
            'modules/models/academic-setup/class.js': ['v2-academic-class', 'v2-academic-classes'],
            'modules/models/academic-setup/subject.js': ['v2-academic-subject', 'v2-academic-subjects'],
            'modules/models/academic-setup/subject-group.js': ['v2-academic-subject-group', 'v2-academic-subject-groups'],
            'modules/models/audit/activity-log.js': ['v2-activity-log', 'v2-activity-logs'],
            'modules/models/student/student-enrollment.js': ['v2-student-enrollment', 'v2-student-enrollments'],
            'modules/models/settings/school-profile.js': ['v2-school-profile', 'v2-school-profiles'],
        };
        for (const [file, [name, coll]] of Object.entries(expect)) {
            assert.strictEqual(registry.get(file).modelName, name, file);
            assert.strictEqual(registry.get(file).collection, coll, file);
        }
    },
    'every ref: in a v2 model names a registered model, and a v2 one': () => {
        const names = new Set([...registry.values()].map((r) => r.modelName));
        const bad = [];
        for (const [file, r] of registry.entries()) {
            if (!r.modelName.startsWith('v2-')) continue;
            r.schema.eachPath((p, type) => {
                const ref = (type.options && type.options.ref) || (type.caster && type.caster.options && type.caster.options.ref);
                if (typeof ref !== 'string') return;
                if (!names.has(ref) || !ref.startsWith('v2-')) bad.push(`${file} ${p} -> '${ref}'`);
            });
        }
        assert.deepStrictEqual(bad, [], bad.join('\n'));
    },
};

let failed = 0;
Object.entries(tests).forEach(([name, fn]) => {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  FAIL ${name}\n       ${error.message}`);
    }
});
console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
