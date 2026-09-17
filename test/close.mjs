// Run after TypeScript compilation: node --experimental-vm-modules test/close.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

let answer = 0;
let confirms = 0;
const clickgo = new SyntheticModule(['form', 'native', 'fs'], function() {
    this.setExport('form', {
        AbstractForm: class {
            close() { this.closed = true; }
        },
        confirm: async () => { ++confirms; return await answer; },
    });
    this.setExport('native', {});
    this.setExport('fs', {});
});
const mod = new SourceTextModule(await readFile(new URL('../dist/app/form/main.js', import.meta.url), 'utf8'));
await mod.link(() => clickgo);
await mod.evaluate();
const Main = mod.namespace.default;
const dirty = () => {
    const form = new Main();
    form.text = 'unsaved';
    return form;
};

const blank = new Main();
await blank.exit();
assert.equal(blank.closed, true);
assert.equal(confirms, 0);

const saved = dirty();
saved.nosave = false;
await saved.exit();
assert.equal(saved.closed, true);

answer = 0;
const cancel = dirty();
await cancel.exit();
assert.equal(cancel.closed, undefined);
assert.equal(cancel.closing, false);
assert.equal(cancel.text, 'unsaved');

answer = false;
const discard = dirty();
await discard.exit();
assert.equal(discard.closed, true);

answer = true;
for (const result of [false, true]) {
    const form = dirty();
    let saves = 0;
    form.save = async () => { ++saves; return result; };
    await form.exit();
    assert.equal(saves, 1);
    assert.equal(form.closed, result ? true : undefined);
}

const cleared = dirty();
cleared.file = '/example.txt';
cleared.text = '';
answer = 0;
const beforeCleared = confirms;
await cleared.exit();
assert.equal(confirms, beforeCleared + 1);
assert.equal(cleared.closed, undefined);

let resolve;
answer = new Promise(r => { resolve = r; });
const concurrent = dirty();
const beforeConcurrent = confirms;
const pending = concurrent.exit();
assert.equal(concurrent.closing, true);
await concurrent.exit();
concurrent.toNew();
assert.equal(concurrent.text, 'unsaved');
assert.equal(confirms, beforeConcurrent + 1);
resolve(0);
await pending;
assert.equal(concurrent.closing, false);

const saving = dirty();
saving._saving = true;
await saving.exit();
assert.equal(saving.closed, undefined);

const button = dirty();
let prevented = false;
answer = 0;
button.onClose({ preventDefault() { prevented = true; } });
assert.equal(prevented, true);
await new Promise(r => setImmediate(r));
assert.equal(button.closed, undefined);

const installing = dirty();
installing.installingUpdate = true;
installing.onClose({ preventDefault() { throw new Error('Updater exit was blocked'); } });
console.log('Close confirmation regression checks passed.');
