// Run with Electron: electron dist/abox/test/mcp-desktop.mjs
// Uses the real Notepad Boot, packed App and installed frameworks; only the process entry is a test wrapper.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { app, BrowserWindow, session, net, ipcMain } from 'electron';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import * as native from 'clickgo-native';

const commandProcess = process.argv.includes('--cli') || process.argv.includes('--mcp');
if (!commandProcess) {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
    const directory = await mkdtemp(join(tmpdir(), 'notepad-mcp-'));
    process.env['CLICKGO_NATIVE_RUNTIME_DIR'] = join(directory, 'run');
    process.env['NOTEPAD_MCP_TEST_DIR'] = directory;
    app.setPath('userData', join(directory, 'profile'));
    const startupFile = join(directory, 'startup.json');
    await writeFile(startupFile, '{"source":"startup"}');
    process.env['NOTEPAD_STARTUP_FILE'] = startupFile;
    process.argv.push(startupFile);
}
if (!commandProcess) {
    // Use the installed local build while keeping the production CDN import unchanged.
    app.once('ready', () => session.defaultSession.protocol.handle('https', request => {
        const url = new URL(request.url);
        const prefix = '/npm/clickgo@7.3.1/';
        if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith(prefix)) {
            const file = new URL('../../../node_modules/clickgo/' + url.pathname.slice(prefix.length), import.meta.url);
            return net.fetch(file.href);
        }
        return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }));
}
await import('../../index.js');

if (!commandProcess) {
    // Electron waits for entry-module evaluation before app readiness. Do not await the GUI test at module scope.
    void (async () => {
        const clients = [];
        const diagnostic = [];
        app.on('web-contents-created', (_event, contents) => {
            // Wayland may refuse programmatic focus; keep this isolated test's frame callbacks running.
            contents.setBackgroundThrottling(false);
            contents.on('console-message', event => {
                if (event.level === 'error') { diagnostic.push(event.message); }
            });
            contents.on('did-fail-load', (_event, code, description) => diagnostic.push(`${code}: ${description}`));
        });
        try {
            const deadline = Date.now() + 60000;
            let page;
            let apps;
            while (Date.now() < deadline) {
                const window = BrowserWindow.getAllWindows()[0];
                page = window?.webContents;
                if (window) {
                    window.show();
                    page.setBackgroundThrottling(false);
                }
                if (page && !page.isLoading() && native.getMcpInfo()) {
                    apps = await page.executeJavaScript("window['clickgo']?.command.listTasks()");
                    if (apps?.length) {
                        const names = await page.executeJavaScript(`window['clickgo'].command.list(${JSON.stringify(apps[0].id)}).map(item => item.name)`);
                        if (names.includes('document.read')) {
                            break;
                        }
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            assert.ok(apps?.length, 'Notepad App loads');
            const info = native.getMcpInfo();
            assert.ok(info);
            const client = new Client({ name: 'notepad-acceptance', version: '1' });
            clients.push(client);
            await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
                requestInit: { headers: { Authorization: `Bearer ${info.token}` } },
            }));
            const call = async (connection, name, args) => {
                const result = await connection.callTool({ name, arguments: args });
                return result.structuredContent ?? JSON.parse(result.content[0].text);
            };
            const discovered = await call(client, 'clickgo_list_apps', {});
            assert.equal(discovered.ok, true);
            const taskId = discovered.data.find(item => item.name === 'ClickGo Notepad').id;
            const updateState = await page.executeJavaScript(`import('https://cdn.jsdelivr.net/npm/clickgo@7.3.1/dist/index.js').then(module => module.native.getUpdateState(${JSON.stringify(taskId)}))`);
            assert.equal(updateState.status, 'disabled');
            assert.equal(updateState.reason, 'development', 'the installed Native update API is enabled and available');
            const commands = await call(client, 'clickgo_list_commands', { taskId });
            assert.equal(commands.data.length, 9);
            const execute = (name, args = {}) => call(client, 'clickgo_execute_command', { taskId, name, args });
            BrowserWindow.getAllWindows()[0].show();
            BrowserWindow.getAllWindows()[0].focus();
            // Use real mouse events so the test follows ClickGo's pointer/tap menu flow.
            const clickControl = async (control, label) => {
                let point;
                for (let attempt = 0; attempt < 200; ++attempt) {
                    point = await page.executeJavaScript(`(() => {
                    const items = [...document.querySelectorAll('[data-cg-control="${control}"]')];
                    const item = items.find(item => item.textContent.trim() === ${JSON.stringify(label)} || [...item.children].some(child => child.textContent.trim() === ${JSON.stringify(label)}));
                    if (!item || item.offsetParent === null || item.hasAttribute('data-cg-disabled')) { return null; }
                    const form = item.closest('[data-cg-control="form"]');
                    if (form && Number(getComputedStyle(form).opacity) < .99) { return null; }
                    if (${JSON.stringify(control)} === 'button' && item.getAttribute('tabindex') !== '0') { return null; }
                    item.scrollIntoView({ block: 'center', inline: 'nearest' });
                    const rect = item.getBoundingClientRect();
                    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
                })()`);
                    if (point) { break; }
                    await new Promise(resolve => setTimeout(resolve, 30));
                }
                if (!point) {
                    console.error(await page.executeJavaScript(`JSON.stringify([...document.querySelectorAll('[data-cg-control="${control}"]')].map(item => ({ text: item.textContent, hidden: item.offsetParent === null, disabled: item.hasAttribute('data-cg-disabled'), formOpacity: item.closest('[data-cg-control="form"]') && getComputedStyle(item.closest('[data-cg-control="form"]')).opacity })))`));
                }
                assert.ok(point, `${label} is available`);
                page.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
                page.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
                await new Promise(resolve => setTimeout(resolve, 200));
            };
            let startup;
            for (let attempt = 0; attempt < 100; ++attempt) {
                startup = await execute('document.read');
                if (startup.ok && startup.data.file === process.env['NOTEPAD_STARTUP_FILE']) { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(startup.data.file, process.env['NOTEPAD_STARTUP_FILE'], 'launch file reaches the Form after startup');
            assert.equal(startup.data.text, '{"source":"startup"}');
            assert.equal(startup.data.unsaved, false);
            assert.equal((await execute('document.new', { expectedRevision: startup.data.revision })).ok, true);
            let result = await execute('document.read');
            assert.equal(result.ok, true);
            const beforeUpdate = result.data;
            assert.equal(beforeUpdate.unsaved, false, 'new empty document is pristine');
            await clickControl('menu-item', 'View');
            await clickControl('menulist-item', 'Check for Updates');
            await clickControl('button', 'OK');
            let ready = false;
            for (let attempt = 0; attempt < 100; ++attempt) {
                ready = await page.executeJavaScript("document.body.textContent.includes('Ready')");
                if (ready) { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(ready, true, 'update dialog closes and restores the pristine status');
            result = await execute('document.read');
            assert.equal(result.data.unsaved, false, 'update confirmation leaves the empty document pristine');
            assert.equal(result.data.revision, beforeUpdate.revision, 'update confirmation does not produce an edit');
            assert.equal(result.data.text, beforeUpdate.text);
            assert.equal(result.data.file, beforeUpdate.file);
            await page.executeJavaScript(`document.querySelector('textarea').dispatchEvent(new Event('input', { bubbles: true }))`);
            result = await execute('document.read');
            assert.equal(result.data.revision, beforeUpdate.revision, 'unchanged DOM input does not count as an edit');
            assert.equal(result.data.unsaved, false);
            assert.ok((await page.executeJavaScript('document.body.textContent')).includes('Ready'));
            // The entire flat item is interactive, with no nested ClickGo button or extra rounded border.
            const statusAppearance = await page.executeJavaScript(`(() => {
                const item = [...document.querySelectorAll('[data-cg-control="statusbar-item"]')].find(item => item.textContent.trim() === 'UTF-8');
                const style = getComputedStyle(item);
                return { nested: !!item.querySelector('[data-cg-control="button"]'), role: item.getAttribute('role'), radius: style.borderRadius, height: item.getBoundingClientRect().height, barHeight: item.closest('[data-cg-control="statusbar"]').getBoundingClientRect().height };
            })()`);
            assert.equal(statusAppearance.nested, false);
            assert.equal(statusAppearance.role, 'button');
            assert.equal(statusAppearance.radius, '0px');
            assert.ok(Math.abs(statusAppearance.height - statusAppearance.barHeight) <= 1);
            const flatStatusImage = await page.capturePage();
            await writeFile(join(process.env['NOTEPAD_MCP_TEST_DIR'], 'flat-statusbar.png'), flatStatusImage.toPNG());
            // A real status-bar click opens the encoding dialog; Cancel must keep pristine state.
            await clickControl('statusbar-item', 'UTF-8');
            const disabledStatus = await page.executeJavaScript(`(() => {
                const item = [...document.querySelectorAll('[data-cg-control="statusbar-item"]')].find(item => item.textContent.trim() === 'UTF-8');
                return { disabled: item.getAttribute('aria-disabled'), tabindex: item.getAttribute('tabindex') };
            })()`);
            assert.equal(disabledStatus.disabled, 'true', 'the pending encoding operation disables the whole item');
            assert.equal(disabledStatus.tabindex, null);
            await clickControl('button', 'Cancel');
            result = await execute('document.read');
            assert.equal(result.data.unsaved, false);
            assert.equal(result.data.revision, beforeUpdate.revision);
            // Dispatch keyboard events to the mounted DOM; OS window focus is environment-dependent in this harness.
            let statusFocused = false;
            for (let attempt = 0; attempt < 100; ++attempt) {
                statusFocused = await page.executeJavaScript(`(() => {
                    const item = [...document.querySelectorAll('[data-cg-control="statusbar-item"]')].find(item => item.textContent.trim() === 'UTF-8');
                    if (!item || item.getAttribute('tabindex') !== '0') { return false; }
                    item.focus(); return document.activeElement === item;
                })()`);
                if (statusFocused) { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(statusFocused, true);
            await page.executeJavaScript(`(() => {
                const item = [...document.querySelectorAll('[data-cg-control="statusbar-item"]')].find(item => item.textContent.trim() === 'UTF-8');
                item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                item.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
            })()`);
            await clickControl('button', 'Cancel');
            BrowserWindow.getAllWindows()[0].setContentSize(360, 240);
            await new Promise(resolve => setTimeout(resolve, 200));
            await clickControl('statusbar-item', 'UTF-8');
            const encodingImage = await page.capturePage();
            await writeFile(join(process.env['NOTEPAD_MCP_TEST_DIR'], 'encoding-dialog.png'), encodingImage.toPNG());
            await clickControl('check', 'Include BOM when saving');
            await clickControl('button', 'Convert');
            for (let attempt = 0; attempt < 100; ++attempt) {
                result = await execute('document.read');
                if (result.data.bom) { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(result.data.bom, true);
            assert.equal(result.data.unsaved, true);
            assert.ok((await page.executeJavaScript('document.body.textContent')).includes('UTF-8 BOM'));
            assert.equal((await execute('document.new', { expectedRevision: result.data.revision })).ok, true);
            result = await execute('document.read');
            BrowserWindow.getAllWindows()[0].setContentSize(500, 400);
            await new Promise(resolve => setTimeout(resolve, 200));
            let revision = result.data.revision;
            result = await execute('document.replace', { expectedRevision: revision, text: 'Hello AI\n你好 🌍' });
            assert.equal(result.ok, true);
            revision = result.data.revision;
            assert.equal(await page.executeJavaScript('document.querySelector("textarea").value'), 'Hello AI\n你好 🌍');
            assert.equal((await execute('document.replace', { expectedRevision: revision - 1, text: 'stale' })).error.code, 'document-changed');
            assert.equal((await execute('document.edit', { expectedRevision: revision, start: 0, end: 999, text: '' })).error.code, 'invalid-range');
            assert.equal((await execute('document.replace', { expectedRevision: revision, text: 3 })).error.code, 'invalid-input');
            assert.equal((await execute('document.read', { unexpected: true })).error.code, 'invalid-input');
            // Native must reject unauthenticated HTTP requests.
            assert.equal((await fetch(info.url)).status, 401);
            const target = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'notes.txt');
            result = await execute('document.saveAs', { expectedRevision: revision, path: target });
            assert.equal(result.ok, true);
            revision = result.data.revision;
            assert.equal(await readFile(target, 'utf8'), 'Hello AI\n你好 🌍');
            // Use the real Native drop handler and bridge; OS/preload sender validation is covered by Native window tests.
            const dropped = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'dropped.json');
            await writeFile(dropped, '{"source":"drop"}');
            ipcMain.emit('drop-files', { sender: page, senderFrame: page.mainFrame }, [dropped]);
            for (let attempt = 0; attempt < 100; ++attempt) {
                result = await execute('document.read');
                if (result.ok && result.data.file === dropped) { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(result.data.file, dropped);
            assert.equal(result.data.text, '{"source":"drop"}');
            assert.equal(result.data.unsaved, false);
            result = await execute('document.open', { expectedRevision: result.data.revision, path: target });
            assert.equal(result.ok, true);
            revision = result.data.revision;
            // Native CLI and stdio connect to the exact same editor state.
            const entry = fileURLToPath(import.meta.url);
            const cli = await promisify(execFile)(process.execPath, [entry, '--cli', 'apps'], { env: process.env });
            assert.equal(JSON.parse(cli.stdout).data[0].id, taskId);
            const stdio = new Client({ name: 'notepad-stdio-acceptance', version: '1' });
            clients.push(stdio);
            await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mcp'], env: process.env }));
            const stdioRead = await call(stdio, 'clickgo_execute_command', { taskId, name: 'document.read', args: {} });
            assert.equal(stdioRead.data.text, 'Hello AI\n你好 🌍');
            // An ordinary input event invalidates an AI snapshot.
            await page.executeJavaScript(`(() => { const text = document.querySelector('textarea'); text.value = 'Edited in UI'; text.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal((await execute('document.replace', { expectedRevision: revision, text: 'stale after UI' })).error.code, 'document-changed');
            result = await execute('document.read');
            assert.equal(result.data.text, 'Edited in UI');
            const statusText = await page.executeJavaScript('document.body.textContent');
            assert.ok(statusText.includes('12 chars'), 'statistics update after an ordinary input event');
            assert.ok(statusText.includes('1 line'), 'line statistics remain reactive in the packed App');
            revision = result.data.revision;
            result = await execute('document.save', { expectedRevision: revision });
            assert.equal(result.ok, true);
            assert.equal(await readFile(target, 'utf8'), 'Edited in UI');
            const source = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'source.json');
            await writeFile(source, '{"source":"MCP"}');
            result = await execute('document.open', { expectedRevision: revision, path: source });
            assert.equal(result.ok, true);
            revision = result.data.revision;
            assert.equal((await execute('document.read')).data.text, '{"source":"MCP"}');
            // Real Native filesystem bytes + packed App + public encoding commands.
            const legacy = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'gb18030.txt');
            await writeFile(legacy, Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
            const openingLegacy = execute('document.open', { expectedRevision: revision, path: legacy });
            await clickControl('button', 'Open');
            result = await openingLegacy;
            assert.equal(result.ok, true);
            assert.equal(result.data.encoding, 'gb18030');
            assert.equal((await execute('document.read')).data.text, '中文');
            assert.ok((await page.executeJavaScript('document.body.textContent')).includes('GB18030'));
            const legacyCopy = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'gb-copy.txt');
            result = await execute('document.saveAs', { expectedRevision: result.data.revision, path: legacyCopy });
            assert.equal(result.ok, true);
            assert.deepEqual([...await readFile(legacyCopy)], [0xd6, 0xd0, 0xce, 0xc4]);
            result = await execute('document.encoding', { expectedRevision: result.data.revision, encoding: 'utf-16be', bom: true });
            assert.equal(result.ok, true);
            const utf16 = join(process.env['NOTEPAD_MCP_TEST_DIR'], 'utf16.txt');
            result = await execute('document.saveAs', { expectedRevision: result.data.revision, path: utf16 });
            assert.deepEqual([...await readFile(utf16)], [0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]);
            result = await execute('document.open', { expectedRevision: result.data.revision, path: utf16 });
            assert.equal(result.ok, true);
            assert.equal(result.data.encoding, 'utf-16be');
            assert.equal(result.data.bom, true);
            assert.equal((await execute('document.read')).data.text, '中文');
            assert.ok((await page.executeJavaScript('document.body.textContent')).includes('UTF-16 BE'));
            // Reopen uses the selected decoding on the actual changed file, at the minimum window size.
            await writeFile(utf16, Buffer.from([0xfe, 0xff, 0x65, 0x87]));
            BrowserWindow.getAllWindows()[0].setContentSize(360, 240);
            await new Promise(resolve => setTimeout(resolve, 200));
            await clickControl('statusbar-item', 'UTF-16 BE');
            const reopenImage = await page.capturePage();
            await writeFile(join(process.env['NOTEPAD_MCP_TEST_DIR'], 'encoding-reopen.png'), reopenImage.toPNG());
            await clickControl('button', 'Reopen');
            for (let attempt = 0; attempt < 100; ++attempt) {
                result = await execute('document.read');
                if (result.data.text === '文') { break; }
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.equal(result.data.text, '文');
            assert.equal(result.data.encoding, 'utf-16be');
            assert.equal(result.data.unsaved, false);
            BrowserWindow.getAllWindows()[0].setContentSize(500, 400);
            await new Promise(resolve => setTimeout(resolve, 200));
            result = await execute('editor.wordWrap', { enabled: false });
            assert.equal(result.data.wordWrap, false);
            BrowserWindow.getAllWindows()[0].show();
            BrowserWindow.getAllWindows()[0].focus();
            if (process.env['NOTEPAD_MCP_TEST_SIZE'] === 'small') {
                BrowserWindow.getAllWindows()[0].setContentSize(360, 240);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            await clickControl('menu-item', 'View');
            await clickControl('menulist-item', 'AI Access');
            const publicGuide = await page.executeJavaScript("window['clickgo'].command.getAgentGuide()");
            assert.ok(publicGuide.includes('--mcp'));
            assert.equal(publicGuide.includes(info.token), false);
            let guideText;
            for (let attempt = 0; attempt < 100; ++attempt) {
                guideText = await page.executeJavaScript(`(() => {
                    return [...document.querySelectorAll('textarea')].filter(item => item.offsetParent !== null && Number(getComputedStyle(item.closest('[data-cg-control="form"]')).opacity) > .99).map(item => item.value).find(value => value.includes('--mcp'));
                })()`);
                if (guideText) { break; }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(guideText, 'AI Access displays the generated guide');
            assert.equal(guideText.includes(info.token), false);
            await new Promise(resolve => setTimeout(resolve, 500));
            const image = await page.capturePage();
            await writeFile(join(process.env['NOTEPAD_MCP_TEST_DIR'], 'notepad.png'), image.toPNG());
            await clickControl('button', 'Show HTTP connection settings');
            let connection;
            for (let attempt = 0; attempt < 100; ++attempt) {
                connection = await page.executeJavaScript(`(() => {
                const value = [...document.querySelectorAll('textarea')].map(item => item.value).find(value => value.trim().startsWith('{') && value.includes('\"Authorization\"'));
                return value ? JSON.parse(value) : null;
            })()`);
                if (connection) { break; }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.equal(connection?.url, info.url);
            assert.ok(connection?.headers.Authorization === `Bearer ${info.token}`, 'HTTP settings contain the current credential');
            console.log('HTTP MCP, CLI, stdio, encoding detection/conversion/reopening, lossless saving, shared UI editing and stale revision checks passed.');
            console.log(`Screenshot: ${join(process.env['NOTEPAD_MCP_TEST_DIR'], 'notepad.png')}`);
        }
        catch (error) {
            console.error(error);
            console.error('Window count:', BrowserWindow.getAllWindows().length, 'MCP enabled:', native.getMcpInfo() !== null);
            console.error(diagnostic);
            for (const window of BrowserWindow.getAllWindows()) {
                console.error(await window.webContents.executeJavaScript('document.body.innerText'));
                const image = await window.webContents.capturePage();
                await writeFile(join(process.env['NOTEPAD_MCP_TEST_DIR'], 'failure.png'), image.toPNG());
            }
            process.exitCode = 1;
        }
        finally {
            for (const client of clients) {
                await client.close();
            }
            await native.stopMcp();
            // Destroy only this temporary acceptance window without a production close confirmation.
            for (const window of BrowserWindow.getAllWindows()) {
                window.destroy();
            }
            app.exit(process.exitCode ?? 0);
        }
    })();
}
