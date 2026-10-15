// Run after TypeScript compilation: node --experimental-vm-modules dist/abox/test/open-file.mjs
import assert from 'node:assert/strict';
import * as encodingApi from './encoding-api.mjs';
import * as textApi from '../../app/lib/text.js';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const contents = {
    '/storage/tmp/startup.json': '{"source":"startup"}',
    '/storage/tmp/dropped.json': '{"source":"drop"}',
};
let discard = false;
const dialogs = [];
const clickgo = new SyntheticModule(['form', 'native', 'fs', 'isNative', 'tool'], function() {
    this.setExport('form', {
        AbstractForm: class { constructor() { this.formId = 'form'; } },
        get: () => true,
        dialog: async (_current, options) => {
            dialogs.push(options);
            return discard ? 'Discard' : undefined;
        },
    });
    this.setExport('native', {
        onUpdateState() {},
        checkUpdates: async () => ({ status: 'disabled', currentVersion: '2.0.0' }),
        on() {},
        invoke: async () => { throw new Error('Business must not pull files over custom IPC'); },
    });
    this.setExport('fs', {
        getContent: async (_current, path) => Object.hasOwn(contents, path) ? new Blob([contents[path]]) : null,
    });
    this.setExport('isNative', () => true);
    this.setExport('tool', encodingApi);
});
const mod = new SourceTextModule(await readFile(new URL('../../app/form/main.js', import.meta.url), 'utf8'));
const textModule = new SyntheticModule(Object.keys(textApi), function() {
    for (const [name, value] of Object.entries(textApi)) { this.setExport(name, value); }
});
const ai = new SyntheticModule(['default'], function() {
    this.setExport('default', class {});
});
const commands = new SyntheticModule(['register'], function() {
    this.setExport('register', () => {});
});
await mod.link(name => name === 'clickgo' ? clickgo : name.endsWith('/text') ? textModule : name.endsWith('/command') ? commands : ai);
await mod.evaluate();
const Main = mod.namespace.default;
const form = new Main();
form.onMounted();
form.onNativeOpenFiles(['/tmp/startup.json', '/tmp/ignored.json']);
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/startup.json');
assert.equal(form.text, '{"source":"startup"}');
assert.equal(form.nosave, false);

form.text = 'Unsaved changes';
form.nosave = true;
form.onNativeOpenFiles(['/tmp/dropped.json']);
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/startup.json', 'cancel preserves the edited document');
assert.equal(form.text, 'Unsaved changes');
assert.equal(form.nosave, true);
discard = true;
form.onNativeOpenFiles(['/tmp/dropped.json']);
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/dropped.json');
assert.equal(form.text, '{"source":"drop"}');
assert.equal(form.nosave, false);

form.onNativeOpenFiles(['/tmp/missing.txt']);
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/dropped.json');
assert.equal(dialogs.at(-1), 'Unable to open the document. Please check that the file is still available.');
form.loading = true;
form.onNativeOpenFiles(['/tmp/startup.json']);
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/dropped.json', 'busy Form retains the file request');
form.loading = false;
await form.newDocument();
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.file, '/tmp/startup.json', 'file request resumes after the business operation');
console.log('Native startup and dropped-file opening regression checks passed.');
