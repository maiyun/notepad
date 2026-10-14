import assert from 'node:assert/strict';
import { summarize, countSelection, cursorPosition } from '../../app/lib/text.js';

assert.deepEqual(summarize(''), { characterCount: 0, lineCount: 1, lineEnding: 'LF' });
assert.deepEqual(summarize('A🌍e\u0301\r\nB\rC\n'), { characterCount: 10, lineCount: 4, lineEnding: 'CRLF' });
assert.equal(countSelection('A🌍B', 1, 3), 1);
assert.equal(countSelection('A🌍B', 3, 1), 1);
assert.equal(countSelection('A🌍B', 1, 2), 1);
assert.deepEqual(cursorPosition('A\r\n🌍', 2), { line: 2, column: 1 });
assert.deepEqual(cursorPosition('A\r\n🌍', 4), { line: 2, column: 2 });
assert.deepEqual(cursorPosition('A\r\n🌍', 5), { line: 2, column: 2 });

function reference(text, a, b) {
    const start = Math.max(0, Math.min(a, b, text.length));
    const end = Math.max(0, Math.min(Math.max(a, b), text.length));
    const offset = Math.max(0, Math.min(b, text.length));
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
    return {
        summary: {
            characterCount: Array.from(text).length,
            lineCount: text.split(/\r\n|\r|\n/).length,
            lineEnding: text.includes('\r\n') ? 'CRLF' : text.includes('\r') ? 'CR' : 'LF',
        },
        selected: Array.from(text.slice(start, end)).length,
        cursor: { line: lines.length, column: Array.from(lines.at(-1)).length + 1 },
    };
}
let seed = 479;
function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
}
const atoms = ['a', '文', '🌍', '\r', '\n', '\r\n', '\ud800', '\udc00', '\u0301'];
const texts = ['', 'A\r\nB', '🌍\ud800\udc00\ud800', '\r\r\n\n', 'a\u0301b'];
for (let sample = 0; sample < 200; ++sample) {
    texts.push(Array.from({ length: random(100) }, () => atoms[random(atoms.length)]).join(''));
}
let cases = 0;
for (const text of texts) {
    const offsets = [NaN, Infinity, -Infinity, -1, 0, 0.5, 1.5, text.length, text.length + 10];
    for (let index = 0; index <= text.length; ++index) offsets.push(index);
    for (const b of offsets) {
        const a = offsets[random(offsets.length)];
        const expected = reference(text, a, b);
        assert.deepEqual(summarize(text), expected.summary);
        assert.equal(countSelection(text, a, b), expected.selected);
        assert.deepEqual(cursorPosition(text, b), expected.cursor);
        ++cases;
    }
}
console.log(`Text statistics passed: ${cases} Unicode, mixed-newline, cursor and selection compatibility cases.`);
