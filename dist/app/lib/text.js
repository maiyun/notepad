import * as lAboxText from '../abox/text.js';
export function summarize(text) {
    return lAboxText.summarize(text);
}
export function countSelection(text, start, end) {
    return lAboxText.countSelection(text, start, end);
}
export function cursorPosition(text, offset) {
    return lAboxText.cursorPosition(text, offset);
}
