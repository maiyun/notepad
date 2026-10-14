// Run after TypeScript compilation: node --experimental-vm-modules dist/abox/test/native-open-file.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

let boot;
let options;
const methods = {};
const events = [];

class AbstractBoot {
    on(name, handler) {
        methods[name] = handler;
    }

    emit(name) {
        events.push(name);
        return Promise.resolve(true);
    }

    run() {}
}

const native = new SyntheticModule(['AbstractBoot', 'launcher', 'path', 'startMcp'], function() {
    this.setExport('AbstractBoot', AbstractBoot);
    this.setExport('launcher', (current, settings) => {
        boot = current;
        options = settings;
    });
    this.setExport('path', (_url, path) => path);
    this.setExport('startMcp', async () => ({ 'transport': 'streamable-http' }));
});
const mod = new SourceTextModule(await readFile(new URL('../../index.js', import.meta.url), 'utf8'), {
    initializeImportMeta(meta) {
        meta.url = import.meta.url;
    },
});
await mod.link(() => native);
await mod.evaluate();

await boot.main();
assert.equal(options.updates, true);
assert.equal(options.openFiles, true);
assert.equal(options.singleInstance, true);
assert.deepEqual(Object.keys(methods), [], 'business no longer registers file or update IPC');
assert.equal(Object.hasOwn(Object.getPrototypeOf(boot), 'onOpenFiles'), false, 'file handling now lives in the App global event');
console.log('Native host uses framework file and update events without business forwarding.');
