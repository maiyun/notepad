import * as lAboxText from '../abox/text.js';

/** --- 文档统计；字符按 Unicode 码点计数，换行不合并字符数 --- */
export interface ITextSummary {
    'characterCount': number;
    'lineCount': number;
    'lineEnding': 'CRLF' | 'CR' | 'LF';
}

/** --- 光标行列均从 1 开始，列按 Unicode 码点计数 --- */
export interface ICursorPosition {
    'line': number;
    'column': number;
}

/**
 * --- 统计文档；空文档为一行，CRLF 视为一个换行 ---
 * @param text 文档文本
 * @returns 字符数、行数及换行类型；混合换行优先 CRLF，其次 CR，否则 LF
 */
export function summarize(text: string): ITextSummary {
    return lAboxText.summarize(text);
}

/**
 * --- 统计选区字符，颠倒的端点按正向选区处理 ---
 * @param text 文档文本
 * @param start UTF-16 选区端点，限定到文档范围并截断小数
 * @param end UTF-16 选区端点，不含结束位置；切开的代理项单独计数
 * @returns 选区的 Unicode 码点数，空选区为 0
 */
export function countSelection(text: string, start: number, end: number): number {
    return lAboxText.countSelection(text, start, end);
}

/**
 * --- 计算光标前文本的行列，CRLF 中间的光标按已越过 CR 处理 ---
 * @param text 文档文本
 * @param offset UTF-16 光标偏移，限定到文档范围并截断小数
 * @returns 从 1 开始的行列；NaN 偏移按 0 处理
 */
export function cursorPosition(text: string, offset: number): ICursorPosition {
    return lAboxText.cursorPosition(text, offset);
}
