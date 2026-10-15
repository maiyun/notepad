import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as codec from './encoding-api.mjs';

const files = new Map();
const written = [];
let answer = 'Cancel';
let writeOK = true;
const messages = [];
const clickgo = new SyntheticModule(['form', 'tool', 'fs', 'isNative', 'command'], function() {
    this.setExport('form', {
        AbstractForm: class { constructor() { this.formId = 'main'; } },
        dialog: async (_form, value) => { messages.push(value); return answer; },
    });
    this.setExport('tool', codec);
    this.setExport('fs', {
        getContent: async (_form, path) => files.get(path) ?? null,
        putContent: async (_form, path, data) => { written.push({ path, bytes: new Uint8Array(await data.arrayBuffer()) }); return writeOK; },
    });
    this.setExport('isNative', () => false);
    this.setExport('command', {});
});
const registry = new SyntheticModule(['register'], function() { this.setExport('register', () => {}); });
const other = new SyntheticModule(['default'], function() { this.setExport('default', class {}); });
const module = new SourceTextModule(await readFile(new URL('../../app/form/main.js', import.meta.url), 'utf8'));
await module.link(name => name === 'clickgo' ? clickgo : name.endsWith('/command') ? registry : other);
await module.evaluate();
const Main = module.namespace.default;
const state = form => ({ file: form.file, text: form.text, encoding: form.encoding, bom: form.bom, unsaved: form.nosave, revision: form.revision });
const fresh = () => new Main();

const form = fresh();
assert.equal(form.encodingLabel, 'UTF-8');
assert.equal(form.nosave, false);
assert.equal(await form.setEncoding('utf-8', false), true);
assert.equal(form.revision, 0);
assert.equal(form.nosave, false);
assert.equal(await form.setEncoding('utf-16be', true), true);
assert.equal(form.nosave, true);
assert.equal(written.length, 0, 'conversion does not write to disk');
assert.equal(form.encodingLabel, 'UTF-16 BE');
assert.equal(await form.newDocument(), true);
assert.equal(form.encoding, 'utf-8');
assert.equal(form.bom, false);
assert.equal(form.nosave, false);

for (const [encoding, bom] of [['utf-8', false], ['utf-8', true], ['utf-16le', true], ['utf-16be', true], ['utf-16le', false], ['gb18030', false]]) {
    const text = '中文 😀\r\n';
    const original = codec.encodeText(text, { encoding, bom });
    const path = `/tmp/${encoding}-${bom}.txt`;
    files.set('/storage' + path, new Blob([original]));
    const current = fresh();
    assert.equal(await current.openDocument(path, undefined, bom || encoding === 'utf-8' ? undefined : encoding), true);
    assert.equal(current.text, text);
    assert.equal(current.encoding, encoding);
    assert.equal(current.bom, bom);
    assert.equal(current.nosave, false);
    assert.equal(await current.saveDocumentAs('/tmp/copied.txt'), true);
    assert.deepEqual(written.at(-1).bytes, original, 'save preserves encoding, BOM and newlines');
}

const selected = fresh();
selected.text = 'Keep this'; selected.onInput(); selected.file = '/tmp/current.txt';
files.set('/storage/tmp/gb.txt', new Blob([new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])]));
answer = 'Discard';
const before = state(selected);
selected._chooseEncoding = async () => null;
assert.equal(await selected.openDocument('/tmp/gb.txt'), false);
assert.deepEqual(state(selected), before, 'cancelled encoding choice keeps the original document');
assert.equal(selected.openingFiles, false);
selected._chooseEncoding = async () => ({ action: 'open', encoding: 'gb18030', bom: false });
assert.equal(await selected.openDocument('/tmp/gb.txt'), true);
assert.equal(selected.text, '中文');
assert.equal(selected.encodingLabel, 'GB18030');
assert.equal(selected.nosave, false);

const good = state(selected);
files.set('/storage/tmp/bad.txt', new Blob([new Uint8Array([0x81])]));
assert.equal(await selected.openDocument('/tmp/bad.txt', undefined, 'gb18030'), false);
assert.deepEqual(state(selected), good, 'invalid bytes never replace the current document');
files.set('/storage/tmp/bad16.txt', new Blob([new Uint8Array([0xff, 0xfe, 0x00, 0xd8])]));
assert.equal(await selected.openDocument('/tmp/bad16.txt', undefined, 'utf-16le'), false);
assert.deepEqual(state(selected), good);
assert.equal(await selected.setEncoding('gb18030', true), false);
assert.deepEqual(state(selected), good);

const controller = new AbortController();
selected._chooseEncoding = async () => { controller.abort(); return { action: 'open', encoding: 'gb18030', bom: false }; };
assert.equal(await selected.openDocument('/tmp/gb.txt', controller.signal), false);
assert.deepEqual(state(selected), good, 'cancellation while choosing cannot commit a new document');

assert.equal(await selected.setEncoding('utf-8', true), true);
assert.equal(selected.nosave, true);
const converted = state(selected);
writeOK = false;
assert.equal(await selected.saveDocumentAs('/tmp/failed.txt'), false);
assert.deepEqual(state(selected), converted, 'write failure keeps file identity, encoding and dirty state');
writeOK = true;
assert.equal(await selected.saveDocumentAs('/tmp/converted.txt'), true);
assert.deepEqual([...written.at(-1).bytes], [0xef, 0xbb, 0xbf, 0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]);
assert.equal(selected.nosave, false);
const writeCount = written.length;
selected.text = '\ud800'; selected.onInput();
assert.equal(await selected.saveDocumentAs('/tmp/invalid.txt'), false);
assert.equal(written.length, writeCount, 'unrepresentable text must never reach the write boundary');
assert.equal(selected.file, '/tmp/converted.txt');
selected.openingFiles = true;
assert.equal(await selected.setEncoding('utf-16le', true), false);
console.log('Document encoding, actual save bytes, BOM preservation, cancellation, failure and dirty-state checks passed.');
