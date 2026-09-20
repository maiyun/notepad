// Run after TypeScript compilation: node --experimental-vm-modules test/native-open-file.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

let boot;
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

const native = new SyntheticModule(['AbstractBoot', 'launcher', 'path'], function() {
    this.setExport('AbstractBoot', AbstractBoot);
    this.setExport('launcher', (current) => {
        boot = current;
    });
    this.setExport('path', (_url, path) => path);
});
const update = new SyntheticModule([
    'checkUpdates',
    'downloadUpdate',
    'installUpdate',
    'getUpdateState',
], function() {
    this.setExport('checkUpdates', async () => undefined);
    this.setExport('downloadUpdate', async () => undefined);
    this.setExport('installUpdate', () => undefined);
    this.setExport('getUpdateState', () => undefined);
});
const mod = new SourceTextModule(await readFile(new URL('../dist/index.js', import.meta.url), 'utf8'), {
    initializeImportMeta(meta) {
        meta.url = import.meta.url;
    },
});
await mod.link((name) => name === 'clickgo-native' ? native : update);
await mod.evaluate();

boot.main();
boot.onOpenFiles(['/tmp/config.json']);
assert.deepEqual(methods['notepad-take-open-files'](), ['/tmp/config.json']);
assert.deepEqual(events, ['notepad-open-files']);

boot.onOpenFiles(['/tmp/script.ts', '/tmp/notes.txt']);
assert.deepEqual(methods['notepad-take-open-files'](), ['/tmp/script.ts']);
assert.deepEqual(events, ['notepad-open-files', 'notepad-open-files']);

console.log('Native JSON and extension-independent file queue regression checks passed.');
