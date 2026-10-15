import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createContext, SourceTextModule } from 'node:vm';

// Load the installed public bundle without starting the browser runtime.
const element = () => ({ style: {}, appendChild() {}, insertAdjacentHTML() {}, remove() {}, getBoundingClientRect: () => ({ width: 96 }) });
const body = element();
const window = { setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, location: { href: 'https://example.test/' } };
const context = createContext({
    window, document: { createElement: element, getElementsByTagName: () => [body], addEventListener() {} },
    navigator: { userAgent: 'test', language: 'en' },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, Blob, URL,
    console, setTimeout, clearTimeout, queueMicrotask,
});
const path = createRequire(import.meta.url).resolve('clickgo');
const module = new SourceTextModule(await readFile(path, 'utf8'), { context, initializeImportMeta: meta => { meta.url = 'https://example.test/clickgo/index.js'; } });
await module.link(() => { throw new Error('The public encoding API must not load external modules'); });
await module.evaluate();
export const decodeText = module.namespace.tool.decodeText;
export const encodeText = module.namespace.tool.encodeText;
