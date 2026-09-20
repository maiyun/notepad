// Run after TypeScript compilation: node --experimental-vm-modules test/open-file.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const listeners = {};
const pending = ['/tmp/startup.json'];
const contents = {
    '/storage/tmp/startup.json': '{"source":"startup"}',
    '/storage/tmp/dropped.json': '{"source":"drop"}',
};
let discard = false;
const dialogs = [];
const clickgo = new SyntheticModule(['form', 'native', 'fs', 'isNative'], function() {
    this.setExport('form', {
        AbstractForm: class { constructor() { this.formId = 'form'; } },
        get: () => true,
        dialog: async (_current, options) => {
            dialogs.push(options);
            return discard ? 'Discard' : undefined;
        },
    });
    this.setExport('native', {
        on(_current, name, handler) { listeners[name] = handler; },
        invoke: async (name) => {
            if (name !== 'notepad-take-open-files') {
                return undefined;
            }
            return pending.splice(0, 1);
        },
    });
    this.setExport('fs', {
        getContent: async (_current, path) => contents[path] ?? null,
    });
    this.setExport('isNative', () => true);
});
const mod = new SourceTextModule(await readFile(new URL('../dist/app/form/main.js', import.meta.url), 'utf8'));
await mod.link(() => clickgo);
await mod.evaluate();
const Main = mod.namespace.default;
const form = new Main();
form.onMounted();
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/startup.json');
assert.equal(form.text, '{"source":"startup"}');
assert.equal(form.nosave, false);

form.text = 'Unsaved changes';
form.nosave = true;
pending.push('/tmp/dropped.json');
discard = true;
listeners['notepad-open-files']();
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/dropped.json');
assert.equal(form.text, '{"source":"drop"}');
assert.equal(form.nosave, false);

pending.push('/tmp/missing.txt');
listeners['notepad-open-files']();
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/dropped.json');
assert.equal(dialogs.at(-1), 'Unable to open the document. Please check that the file is still available.');
console.log('Native startup and dropped-file opening regression checks passed.');
