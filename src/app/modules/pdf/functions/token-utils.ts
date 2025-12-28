import { PDFOperator } from "../model/pdf-operator";
import { PDFToken } from "../model/pdf-token";


export function tokenizeContentStream(bytes: Uint8Array): PDFToken[] {

  const text = new TextDecoder('latin1').decode(bytes);
  // const text = new TextDecoder('UTF-8').decode(bytes);
  const tokens: PDFToken[] = [];

  let i = 0;

  const isWhite = (c: string) => /\s/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);
  const isNameStart = (c: string) => c === '/';

  while (i < text.length) {
    const c = text[i];

    // Skip whitespace
    if (isWhite(c)) {
      i++;
      continue;
    }

    // Comments
    if (c === '%') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    // Names
    if (isNameStart(c)) {
      let start = ++i;
      while (i < text.length && !isWhite(text[i])) i++;
      tokens.push({ type: 'name', value: text.slice(start, i) });
      continue;
    }

    // Strings
    if (c === '(') {
      let depth = 1;
      let start = ++i;
      while (i < text.length && depth > 0) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') depth--;
        i++;
      }
      tokens.push({ type: 'string', value: text.slice(start, i - 1) });
      continue;
    }

    // Arrays
    if (c === '[') {
      tokens.push({ type: 'arrayStart' });
      i++;
      continue;
    }
    if (c === ']') {
      tokens.push({ type: 'arrayEnd' });
      i++;
      continue;
    }

    // Dictionaries
    if (text.startsWith('<<', i)) {
      tokens.push({ type: 'dictStart' });
      i += 2;
      continue;
    }
    if (text.startsWith('>>', i)) {
      tokens.push({ type: 'dictEnd' });
      i += 2;
      continue;
    }

    // Numbers
    if (isDigit(c) || c === '-' || c === '+') {
      let start = i;
      i++;
      while (i < text.length && /[0-9.]/.test(text[i])) i++;
      tokens.push({ type: 'number', value: Number(text.slice(start, i)) });
      continue;
    }

    // Operators (fallback: read until whitespace)
    let start = i;
    while (i < text.length && !isWhite(text[i])) i++;
    tokens.push({ type: 'operator', value: text.slice(start, i) });
  }

  return tokens;
}

export function parseOperators(tokens: PDFToken[]): PDFOperator[] {

  const ops: PDFOperator[] = [];
  let operands: any[] = [];

  const readArray = (i: number): [any[], number] => {
    const arr: any[] = [];
    i++; // skip '['

    while (i < tokens.length && tokens[i].type !== 'arrayEnd') {
      const t = tokens[i];

      if (t.type === 'number' || t.type === 'string' || t.type === 'name') {
        arr.push(t.value);
      } else if (t.type === 'arrayStart') {
        const [nested, newIndex] = readArray(i);
        arr.push(nested);
        i = newIndex;
      } else {
        // ignore unexpected tokens inside arrays
      }

      i++;
    }

    return [arr, i];
  };

  const readDict = (i: number): [Record<string, any>, number] => {
    const dict: Record<string, any> = {};
    i += 1; // skip '<<'

    let key: string | null = null;

    while (i < tokens.length && tokens[i].type !== 'dictEnd') {
      const t = tokens[i];

      if (t.type === 'name') {
        if (key === null) {
          key = t.value;
        } else {
          dict[key] = t.value;
          key = null;
        }
      } else if (t.type === 'number' || t.type === 'string') {
        if (key !== null) {
          dict[key] = t.value;
          key = null;
        }
      } else if (t.type === 'arrayStart') {
        const [arr, newIndex] = readArray(i);
        if (key !== null) {
          dict[key] = arr;
          key = null;
        }
        i = newIndex;
      }

      i++;
    }

    return [dict, i];
  };

  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    switch (t.type) {
      case 'number':
      case 'string':
      case 'name':
        operands.push(t.value);
        break;

      case 'arrayStart': {
        const [arr, newIndex] = readArray(i);
        operands.push(arr);
        i = newIndex;
        break;
      }

      case 'dictStart': {
        const [dict, newIndex] = readDict(i);
        operands.push(dict);
        i = newIndex;
        break;
      }

      case 'inlineImage':
        // Inline images are a single operand followed by EI operator
        ops.push({
          operator: 'INLINE_IMAGE',
          operands: [{ dict: t.dict, data: t.data }]
        });
        operands = [];
        break;

      case 'operator':
        ops.push({
          operator: t.value,
          operands
        });
        operands = [];
        break;
    }

    i++;
  }

  return ops;
}

  export function extractLogicalTextBlocks(ops: PDFOperator[]) {
    const blocks: { type: 'text'; operators: PDFOperator[] }[] = [];
    let current: PDFOperator[] | null = null;
    for (const op of ops) {
      if (op.operator === 'BT') {
        current = [op];
        continue;
      }
      if (op.operator === 'ET') {
        if (current) {
          current.push(op);
          blocks.push({ type: 'text', operators: current });
          current = null;
        }
        continue;
      }
      if (current) {
        current.push(op);
      }
    }
    return blocks;
  }

  export function insertMCIDsIntoBlock(
    block: PDFOperator[],
    startMCID: number
  ): { operators: PDFOperator[]; nextMCID: number } {
    const out: PDFOperator[] = [];
    let mcid = startMCID;

    for (const op of block) {
      if (op.operator === 'BT' || op.operator === 'ET') {
        out.push(op);
        continue;
      }

      const isText =
        op.operator === 'Tj' ||
        op.operator === 'TJ' ||
        op.operator === "'" ||
        op.operator === '"';

      if (isText) {
        out.push({
          operator: 'BDC',
          operands: ['Span', { MCID: mcid }],
        });

        out.push(op);

        out.push({
          operator: 'EMC',
          operands: [],
        });

        mcid++;
        continue;
      }

      out.push(op);
    }

    return { operators: out, nextMCID: mcid };
  }

  export function serializeOperators(ops: PDFOperator[]): string {
    let out = '';

    for (const op of ops) {
      for (const operand of op.operands) {
        if (typeof operand === 'string') {
          if (operand.startsWith('/')) out += operand + ' ';
          else out += `(${operand}) `;
        } else if (typeof operand === 'number') {
          out += operand + ' ';
        } else if (Array.isArray(operand)) {
          out += '[';
          for (const item of operand) {
            if (typeof item === 'string') out += `(${item}) `;
            else out += item + ' ';
          }
          out += '] ';
        } else if (typeof operand === 'object') {
          out += '<< ';
          for (const key in operand) {
            out += `/${key} ${operand[key]} `;
          }
          out += '>> ';
        }
      }

      out += op.operator + '\n';
    }

    return out;
  }

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);

  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}