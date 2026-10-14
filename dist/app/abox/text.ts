import type { ICursorPosition, ITextSummary } from '../lib/text.js';

function isPair(text: string, index: number, end: number): boolean {
    const first = text.charCodeAt(index);
    const second = index + 1 < end ? text.charCodeAt(index + 1) : 0;
    return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff;
}

export function summarize(text: string): ITextSummary {
    let characterCount = 0;
    let lineCount = 1;
    let cr = false;
    let crlf = false;
    for (let index = 0; index < text.length; ++index) {
        ++characterCount;
        const code = text.charCodeAt(index);
        if (code === 13) {
            ++lineCount;
            cr = true;
            crlf ||= text.charCodeAt(index + 1) === 10;
        }
        else if (code === 10 && text.charCodeAt(index - 1) !== 13) {
            ++lineCount;
        }
        if (code >= 0xd800 && code <= 0xdbff && isPair(text, index, text.length)) {
            ++index;
        }
    }
    return { characterCount, lineCount, lineEnding: crlf ? 'CRLF' : cr ? 'CR' : 'LF' };
}

export function countSelection(text: string, a: number, b: number): number {
    const start = Math.trunc(Math.max(0, Math.min(a, b, text.length))) || 0;
    const end = Math.trunc(Math.max(0, Math.min(Math.max(a, b), text.length))) || 0;
    let count = 0;
    for (let index = start; index < end; ++index) {
        ++count;
        if (isPair(text, index, end)) {
            ++index;
        }
    }
    return count;
}

export function cursorPosition(text: string, offset: number): ICursorPosition {
    const end = Math.trunc(Math.max(0, Math.min(offset, text.length))) || 0;
    const prefix = end === text.length ? text : text.slice(0, end);
    let line = 1;
    let lastBreak = -1;
    for (let index = prefix.indexOf('\n'); index >= 0; index = prefix.indexOf('\n', index + 1)) {
        ++line;
        lastBreak = index;
    }
    for (let index = prefix.indexOf('\r'); index >= 0; index = prefix.indexOf('\r', index + 1)) {
        if (index + 1 >= end || text.charCodeAt(index + 1) !== 10) {
            ++line;
        }
        if (index > lastBreak) {
            lastBreak = index;
        }
    }
    let column = 1;
    for (let index = lastBreak + 1; index < end; ++index) {
        ++column;
        if (isPair(text, index, end)) {
            ++index;
        }
    }
    return { line, column };
}
