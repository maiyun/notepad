// Run after TypeScript compilation: node --experimental-vm-modules dist/abox/test/commands.mjs
import assert from 'node:assert/strict';
import * as encodingApi from './encoding-api.mjs';
import * as textApi from '../../app/lib/text.js';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const definitions = new Map();
let answer = 'Cancel';
let nativeEnvironment = false;
let updateResult = { status: 'disabled', currentVersion: '2.0.0' };
let updateFails = false;
let updateHandler;
let installResult = { status: 'restarting', currentVersion: '2.0.0', version: '2.1.0' };
let installCalls = 0;
let chosenPath = '/tmp/picked.txt';
let write = async () => true;
let pick = async () => chosenPath;
const dialogs = [];
const contents = { '/storage/tmp/source.txt': 'Opened text' };
const command = {
    success: data => ({ ok: true, data }),
    failure: (code, message) => ({ ok: false, error: { code, message } }),
    register: (_form, definition) => { definitions.set(definition.name, definition); return true; },
    execute: async (_form, name, args = {}) => {
        const definition = definitions.get(name);
        const enabled = definition.enabled?.() ?? true;
        if (enabled !== true) {
            return command.failure('unavailable', enabled);
        }
        return definition.execute(args, { signal: new AbortController().signal });
    },
};
const clickgo = new SyntheticModule(['form', 'native', 'fs', 'command', 'isNative', 'tool'], function() {
    this.setExport('form', {
        AbstractForm: class { constructor() { this.formId = 'main'; this.loading = false; } },
        get: () => ({}),
        dialog: async (_current, options) => { dialogs.push(options); return await answer; },
    });
    this.setExport('native', { save: () => pick(), open: async () => [chosenPath], invoke: async () => [],
        checkUpdates: async () => {
            if (updateFails) { throw new Error('Update service unavailable'); }
            return updateResult;
        },
        downloadUpdate: async () => ({ status: 'downloaded', currentVersion: '2.0.0', version: '2.1.0' }),
        installUpdate: async () => { ++installCalls; return installResult; },
        onUpdateState: (_form, handler) => { updateHandler = handler; }, on() {} });
    this.setExport('tool', { ...encodingApi, escapeHTML: text => text });
    this.setExport('fs', { putContent: (...args) => write(...args), getContent: async (_form, path) => Object.hasOwn(contents, path) ? new Blob([contents[path]]) : null });
    this.setExport('command', command);
    this.setExport('isNative', () => nativeEnvironment);
});
const textModule = new SyntheticModule(Object.keys(textApi), function() {
    for (const [name, value] of Object.entries(textApi)) { this.setExport(name, value); }
});
const ai = new SyntheticModule(['default'], function() { this.setExport('default', class {}); });
const registry = new SourceTextModule(await readFile(new URL('../../app/lib/command.js', import.meta.url), 'utf8'));
await registry.link(() => clickgo);
const main = new SourceTextModule(await readFile(new URL('../../app/form/main.js', import.meta.url), 'utf8'));
await main.link(name => name === 'clickgo' ? clickgo : name.endsWith('/text') ? textModule : name.endsWith('/command') ? registry : ai);
await main.evaluate();
const form = new main.namespace.default();
form.onMounted();
assert.equal(definitions.size, 9);
const run = (name, args) => command.execute(form, name, args);

let result = await run('document.read');
assert.equal(result.data.text, '');
assert.equal(result.data.unsaved, false);
assert.equal(form.documentStatus, 'Ready');
form.onInput();
assert.equal(form.revision, 0, 'unchanged input must not invalidate a snapshot');
assert.equal(form.nosave, false);
const snapshot = current => ({ text: current.text, file: current.file, revision: current.revision,
    unsaved: current.nosave, start: current.selectionStart, end: current.selectionEnd });
async function checkUpdateUnchanged(current, automatic = false) {
    const before = snapshot(current);
    await current.checkUpdates(automatic);
    assert.deepEqual(snapshot(current), before, 'update checks and dialogs never edit the document');
    assert.equal(current.checkingUpdate, false);
    assert.equal(current.updateStatus, '');
}
await checkUpdateUnchanged(form); // Browser-only message.
nativeEnvironment = true;
for (const status of ['disabled', 'up-to-date', 'error', 'available']) {
    updateResult = { status, currentVersion: '2.0.0', version: '2.1.0' };
    answer = 'Later';
    await checkUpdateUnchanged(form);
}
updateResult = undefined;
await checkUpdateUnchanged(form);
updateFails = true;
await checkUpdateUnchanged(form);
updateFails = false;
updateResult = { status: 'up-to-date', currentVersion: '2.0.0' };
const automaticDialogs = dialogs.length;
await checkUpdateUnchanged(form, true);
assert.equal(dialogs.length, automaticDialogs, 'automatic checks do not open a no-update dialog');
form.onMounted();
await new Promise(resolve => setImmediate(resolve));
updateResult = { status: 'downloaded', currentVersion: '2.0.0', version: '2.1.0' };
answer = 'Later'; await checkUpdateUnchanged(form);
assert.equal(installCalls, 0, 'installation requires confirmation');
answer = 'Restart and Install';
const beforeInstall = snapshot(form);
await form.checkUpdates();
assert.equal(form.installingUpdate, true);
assert.equal(installCalls, 1);
assert.deepEqual(snapshot(form), beforeInstall);
const failedDialogs = dialogs.length;
updateHandler({ status: 'error', errorCode: 'install-failed', currentVersion: '2.0.0' });
await new Promise(resolve => setImmediate(resolve));
assert.equal(form.installingUpdate, false); assert.equal(form.checkingUpdate, false); assert.equal(form.updateStatus, '');
assert.equal(dialogs.length, failedDialogs + 1);
updateHandler({ status: 'error', errorCode: 'install-failed', currentVersion: '2.0.0' });
assert.equal(dialogs.length, failedDialogs + 1, 'duplicate failures do not open duplicate dialogs');
installResult = { status: 'error', errorCode: 'install-failed', currentVersion: '2.0.0' };
await form.checkUpdates(); assert.equal(form.installingUpdate, false); assert.equal(form.updateStatus, '');
nativeEnvironment = false;
answer = 'Cancel';
assert.equal((await run('document.open', { expectedRevision: 0, path: '/tmp/source.txt' })).error.code, 'unavailable');
result = await run('document.replace', { expectedRevision: 0, text: 'A🌍\nB' });
assert.equal(result.data.revision, 1);
assert.equal(form.nosave, true);
assert.equal(form.selectionEnd, 5);
assert.equal((await run('document.replace', { expectedRevision: 0, text: 'lost' })).error.code, 'document-changed');
assert.equal((await run('document.edit', { expectedRevision: 1, start: 2, end: 99, text: '' })).error.code, 'invalid-range');
result = await run('document.read', { offset: 1, length: 2 });
assert.equal(result.data.text, '🌍');
assert.equal(result.data.nextOffset, 3);
result = await run('document.edit', { expectedRevision: 1, start: 5, end: 5, text: 'C' });
assert.equal(form.text, 'A🌍\nBC');
const editedRevision = form.revision;
await run('document.replace', { expectedRevision: editedRevision, text: form.text });
assert.equal(form.revision, editedRevision, 'no-op edit keeps its revision');
await form.toNew();
assert.equal(form.text, 'A🌍\nBC', 'cancelled new preserves text');
answer = 'Discard';
await form.toNew();
assert.equal(form.text, '');
assert.equal(form.revision, editedRevision + 1);
assert.equal(form.nosave, false, 'new empty document has no unsaved edits');
form.onInput();
assert.equal(form.revision, editedRevision + 1, 'resetting the input control does not count as an edit');

nativeEnvironment = true;
assert.equal(await form.save(), true, 'pristine unnamed document can still be saved as an empty file');
assert.equal(form.file, chosenPath);
assert.equal(form.nosave, false);
await form.newDocument();
assert.equal(form.file, '');
assert.equal(form.nosave, false);
form.text = 'To save';
form.onInput();
const beforeSave = form.revision;
write = async () => false;
await run('document.saveAs', { expectedRevision: beforeSave, path: '/tmp/new.txt' });
assert.equal(form.file, '', 'failed write keeps original file identity');
assert.equal(form.nosave, true);
write = async () => true;
result = await run('document.saveAs', { expectedRevision: beforeSave, path: '/tmp/new.txt' });
assert.equal(result.ok, true);
assert.equal(form.file, '/tmp/new.txt');
assert.equal(form.nosave, false);
// New edits during a pending write remain dirty; commands sharing that document are unavailable.
form.text = 'Snapshot';
form.onInput();
let finishWrite;
write = () => new Promise(resolve => { finishWrite = resolve; });
const saving = run('document.save', { expectedRevision: form.revision });
assert.equal((await run('document.replace', { expectedRevision: form.revision, text: 'busy' })).error.code, 'unavailable');
form.text = 'Newer user edit';
form.onInput();
finishWrite(true);
assert.equal((await saving).ok, false);
assert.equal(form.text, 'Newer user edit');
assert.equal(form.nosave, true);
write = async () => true;
// Cancelling while the picker is open must prevent writing.
const controller = new AbortController();
let finishPick;
pick = () => new Promise(resolve => { finishPick = resolve; });
let writes = 0;
write = async () => { ++writes; return true; };
const cancelled = form.saveDocumentAs(undefined, controller.signal);
controller.abort();
finishPick('/tmp/cancelled.txt');
assert.equal(await cancelled, false);
assert.equal(writes, 0);
assert.equal(form.file, '/tmp/new.txt');
// Editing during path selection also prevents writing an unapproved newer revision.
const choosing = form.saveDocumentAs();
form.text = 'Changed while choosing';
form.onInput();
finishPick('/tmp/changed.txt');
assert.equal(await choosing, false);
assert.equal(writes, 0);
// Cancelling after an unsaved confirmation cannot trigger its Save action.
let finishDialog;
answer = new Promise(resolve => { finishDialog = resolve; });
const openController = new AbortController();
const opening = form.openDocument('/tmp/source.txt', openController.signal);
openController.abort();
finishDialog('Save');
assert.equal(await opening, false);
contents['/storage/tmp/empty.txt'] = '';
const openedEmpty = new main.namespace.default();
assert.equal(await openedEmpty.openDocument('/tmp/empty.txt'), true);
assert.equal(openedEmpty.nosave, false);
const loadedRevision = openedEmpty.revision;
openedEmpty.onInput();
assert.equal(openedEmpty.revision, loadedRevision, 'model synchronization after opening is not an edit');
await checkUpdateUnchanged(openedEmpty);
let finishCheck;
updateResult = new Promise(resolve => { finishCheck = resolve; });
const checking = openedEmpty.checkUpdates();
openedEmpty.text = 'Edited while checking';
openedEmpty.onInput();
const duringCheck = snapshot(openedEmpty);
finishCheck({ status: 'up-to-date', currentVersion: '2.0.0' });
await checking;
assert.deepEqual(snapshot(openedEmpty), duringCheck, 'checking does not clear edits made during the request');
assert.equal(openedEmpty.documentStatus, 'Unsaved');
openedEmpty.text = 'x';
openedEmpty.onInput();
openedEmpty.text = '';
openedEmpty.onInput();
assert.equal(openedEmpty.nosave, true, 'clearing an opened file still requires saving');
await checkUpdateUnchanged(openedEmpty);
assert.equal(writes, 0);
assert.equal(form.openingFiles, false);

console.log('Notepad command paging, revisions, unsaved confirmation, save failure, concurrent editing and cancellation checks passed.');
