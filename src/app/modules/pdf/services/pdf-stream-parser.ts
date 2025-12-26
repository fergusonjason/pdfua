import { PDFDocument, PDFPage, PDFContentStream } from 'pdf-lib';

// PDF Operand Types
interface PDFString {
  readonly type: 'string';
  readonly value: string;
}

interface PDFHexString {
  readonly type: 'hexstring';
  readonly value: string;
  readonly rawHex: string;
}

interface PDFNumber {
  readonly type: 'number';
  readonly value: number;
}

interface PDFName {
  readonly type: 'name';
  readonly value: string;
}

interface PDFArray {
  readonly type: 'array';
  readonly value: readonly PDFOperand[];
}

interface PDFDictionary {
  readonly type: 'dictionary';
  readonly value: string;
}

type PDFOperand = PDFString | PDFHexString | PDFNumber | PDFName | PDFArray | PDFDictionary;

// PDF Operation
interface PDFOperation {
  readonly operator: string;
  readonly operands: readonly PDFOperand[];
}

// Text showing operators
type TextShowingOperator = 'Tj' | 'TJ' | "'" | '"';

// Graphics state operators
type GraphicsStateOperator = 'q' | 'Q' | 'cm' | 'w' | 'J' | 'j' | 'M' | 'd' | 'ri' | 'i' | 'gs';

// Path construction operators
type PathOperator = 'm' | 'l' | 'c' | 'v' | 'y' | 'h' | 're';

// Path painting operators
type PaintOperator = 'S' | 's' | 'f' | 'F' | 'f*' | 'B' | 'B*' | 'b' | 'b*' | 'n';

// Color operators
type ColorOperator = 'CS' | 'cs' | 'SC' | 'SCN' | 'sc' | 'scn' | 'G' | 'g' | 'RG' | 'rg' | 'K' | 'k';

// Text object operators
type TextObjectOperator = 'BT' | 'ET';

// Text state operators
type TextStateOperator = 'Tc' | 'Tw' | 'Tz' | 'TL' | 'Tf' | 'Tr' | 'Ts';

// Text positioning operators
type TextPositioningOperator = 'Td' | 'TD' | 'Tm' | 'T*';

// Marked content operators
type MarkedContentOperator = 'BMC' | 'BDC' | 'EMC' | 'MP' | 'DP';

// XObject operators
type XObjectOperator = 'Do';

// All PDF operators
type PDFOperatorType =
  | TextShowingOperator
  | GraphicsStateOperator
  | PathOperator
  | PaintOperator
  | ColorOperator
  | TextObjectOperator
  | TextStateOperator
  | TextPositioningOperator
  | MarkedContentOperator
  | XObjectOperator;

class PDFStreamParser {
  private readonly stream: string;
  private pos: number;
  private readonly operations: PDFOperation[];

  constructor(stream: string | Uint8Array) {
    this.stream = typeof stream === 'string'
      ? stream
      : new TextDecoder().decode(stream);
    this.pos = 0;
    this.operations = [];
  }

  public parse(): readonly PDFOperation[] {
    const operands: PDFOperand[] = [];

    while (this.pos < this.stream.length) {
      this.skipWhitespace();

      if (this.pos >= this.stream.length) break;

      const char = this.stream[this.pos];

      if (char === '(') {
        operands.push(this.parseString());
      }
      else if (char === '<') {
        operands.push(this.parseHexString());
      }
      else if (char === '[') {
        operands.push(this.parseArray());
      }
      else if (char === '/') {
        operands.push(this.parseName());
      }
      else if (this.isNumberStart(char)) {
        operands.push(this.parseNumber());
      }
      else if (this.isLetterStart(char)) {
        const op = this.parseOperator();
        this.operations.push({
          operator: op,
          operands: Object.freeze([...operands])
        });
        operands.length = 0;
      }
      else {
        this.pos++;
      }
    }

    return Object.freeze(this.operations);
  }

  private skipWhitespace(): void {
    while (this.pos < this.stream.length) {
      const char = this.stream[this.pos];
      if (char === ' ' || char === '\n' || char === '\r' ||
          char === '\t' || char === '\f' || char === '\0') {
        this.pos++;
      } else if (char === '%') {
        while (this.pos < this.stream.length &&
               this.stream[this.pos] !== '\n' &&
               this.stream[this.pos] !== '\r') {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  private parseString(): PDFString {
    let str = '';
    let depth = 0;
    this.pos++;

    while (this.pos < this.stream.length) {
      const char = this.stream[this.pos];

      if (char === '\\' && this.pos + 1 < this.stream.length) {
        const next = this.stream[this.pos + 1];
        if (next === 'n') str += '\n';
        else if (next === 'r') str += '\r';
        else if (next === 't') str += '\t';
        else if (next === 'b') str += '\b';
        else if (next === 'f') str += '\f';
        else if (next === '(') str += '(';
        else if (next === ')') str += ')';
        else if (next === '\\') str += '\\';
        else if (next >= '0' && next <= '7') {
          let octal = next;
          this.pos += 2;
          if (this.pos < this.stream.length &&
              this.stream[this.pos] >= '0' &&
              this.stream[this.pos] <= '7') {
            octal += this.stream[this.pos];
            this.pos++;
            if (this.pos < this.stream.length &&
                this.stream[this.pos] >= '0' &&
                this.stream[this.pos] <= '7') {
              octal += this.stream[this.pos];
              this.pos++;
            }
          }
          str += String.fromCharCode(parseInt(octal, 8));
          continue;
        } else {
          str += next;
        }
        this.pos += 2;
      } else if (char === '(') {
        depth++;
        str += char;
        this.pos++;
      } else if (char === ')') {
        if (depth === 0) {
          this.pos++;
          break;
        }
        depth--;
        str += char;
        this.pos++;
      } else {
        str += char;
        this.pos++;
      }
    }

    return Object.freeze({ type: 'string' as const, value: str });
  }

  private parseHexString(): PDFHexString {
    this.pos++;
    let hex = '';

    while (this.pos < this.stream.length && this.stream[this.pos] !== '>') {
      const char = this.stream[this.pos];
      if ((char >= '0' && char <= '9') ||
          (char >= 'a' && char <= 'f') ||
          (char >= 'A' && char <= 'F')) {
        hex += char;
      }
      this.pos++;
    }

    if (this.stream[this.pos] === '>') this.pos++;

    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const byte = hex.substr(i, 2);
      str += String.fromCharCode(parseInt(byte, 16));
    }

    return Object.freeze({
      type: 'hexstring' as const,
      value: str,
      rawHex: hex
    });
  }

  private parseArray(): PDFArray {
    this.pos++;
    const arr: PDFOperand[] = [];

    while (this.pos < this.stream.length) {
      this.skipWhitespace();

      if (this.stream[this.pos] === ']') {
        this.pos++;
        break;
      }

      const char = this.stream[this.pos];

      if (char === '(') {
        arr.push(this.parseString());
      } else if (char === '<') {
        arr.push(this.parseHexString());
      } else if (char === '[') {
        arr.push(this.parseArray());
      } else if (char === '/') {
        arr.push(this.parseName());
      } else if (this.isNumberStart(char)) {
        arr.push(this.parseNumber());
      } else {
        this.pos++;
      }
    }

    return Object.freeze({ type: 'array' as const, value: Object.freeze(arr) });
  }

  private parseName(): PDFName {
    this.pos++;
    let name = '';

    while (this.pos < this.stream.length) {
      const char = this.stream[this.pos];

      if (char === ' ' || char === '\n' || char === '\r' ||
          char === '\t' || char === '/' || char === '[' ||
          char === ']' || char === '(' || char === ')' ||
          char === '<' || char === '>') {
        break;
      }

      if (char === '#' && this.pos + 2 < this.stream.length) {
        const hex = this.stream.substr(this.pos + 1, 2);
        name += String.fromCharCode(parseInt(hex, 16));
        this.pos += 3;
      } else {
        name += char;
        this.pos++;
      }
    }

    return Object.freeze({ type: 'name' as const, value: name });
  }

  private parseNumber(): PDFNumber {
    let num = '';

    while (this.pos < this.stream.length) {
      const char = this.stream[this.pos];

      if ((char >= '0' && char <= '9') || char === '.' ||
          char === '-' || char === '+') {
        num += char;
        this.pos++;
      } else {
        break;
      }
    }

    const value = num.includes('.') ? parseFloat(num) : parseInt(num);
    return Object.freeze({ type: 'number' as const, value });
  }

  private parseOperator(): string {
    let op = '';

    while (this.pos < this.stream.length) {
      const char = this.stream[this.pos];

      if (char === ' ' || char === '\n' || char === '\r' ||
          char === '\t' || char === '\f' || char === '\0') {
        break;
      }

      op += char;
      this.pos++;
    }

    return op;
  }

  private isNumberStart(char: string): boolean {
    return (char >= '0' && char <= '9') || char === '.' ||
           char === '-' || char === '+';
  }

  private isLetterStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '*' || char === "'";
  }
}

class PDFStreamGenerator {
  private readonly operations: readonly PDFOperation[];

  constructor(operations: readonly PDFOperation[]) {
    this.operations = operations;
  }

  private serializeOperand(operand: PDFOperand): string {
    switch (operand.type) {
      case 'string': {
        const escaped = operand.value
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return `(${escaped})`;
      }

      case 'hexstring':
        return `<${operand.rawHex}>`;

      case 'array': {
        const items = operand.value.map(item => this.serializeOperand(item));
        return `[${items.join(' ')}]`;
      }

      case 'name': {
        const name = operand.value
          .replace(/#/g, '#23')
          .replace(/ /g, '#20')
          .replace(/\//g, '#2F');
        return `/${name}`;
      }

      case 'number':
        return operand.value.toString();

      case 'dictionary':
        return operand.value;
    }
  }

  public generate(): string {
    const lines: string[] = [];

    for (const op of this.operations) {
      const operands = op.operands.map(o => this.serializeOperand(o)).join(' ');
      if (operands) {
        lines.push(`${operands} ${op.operator}`);
      } else {
        lines.push(op.operator);
      }
    }

    return lines.join('\n');
  }

  public generateBytes(): Uint8Array {
    const str = this.generate();
    return new TextEncoder().encode(str);
  }
}

interface MCIDOptions {
  readonly tag?: string;
  readonly startMCID?: number;
}

class MCIDInjector {
  private readonly operations: readonly PDFOperation[];
  private mcidCounter: number;

  constructor(operations: readonly PDFOperation[], options: MCIDOptions = {}) {
    this.operations = operations;
    this.mcidCounter = options.startMCID ?? 0;
  }

  public addMCIDMarkers(tag: string = 'Span'): readonly PDFOperation[] {
    const result: PDFOperation[] = [];
    let inTextObject = false;

    for (const op of this.operations) {
      if (op.operator === 'BT') {
        inTextObject = true;
        result.push(op);
        continue;
      }

      if (op.operator === 'ET') {
        inTextObject = false;
        result.push(op);
        continue;
      }

      if (inTextObject && this.isTextShowingOp(op.operator)) {
        result.push({
          operator: 'BDC',
          operands: Object.freeze([
            Object.freeze({ type: 'name' as const, value: tag }),
            Object.freeze({
              type: 'dictionary' as const,
              value: `<</MCID ${this.mcidCounter}>>`
            })
          ])
        });

        result.push(op);

        result.push({
          operator: 'EMC',
          operands: Object.freeze([])
        });

        this.mcidCounter++;
      } else {
        result.push(op);
      }
    }

    return Object.freeze(result);
  }

  public addGraphicsMCID(
    startIndex: number,
    endIndex: number,
    tag: string = 'Figure'
  ): readonly PDFOperation[] {
    const result = [...this.operations];

    result.splice(startIndex, 0, {
      operator: 'BDC',
      operands: Object.freeze([
        Object.freeze({ type: 'name' as const, value: tag }),
        Object.freeze({
          type: 'dictionary' as const,
          value: `<</MCID ${this.mcidCounter}>>`
        })
      ])
    });

    result.splice(endIndex + 2, 0, {
      operator: 'EMC',
      operands: Object.freeze([])
    });

    this.mcidCounter++;
    return Object.freeze(result);
  }

  public getMCIDCount(): number {
    return this.mcidCounter;
  }

  public resetMCIDCounter(): void {
    this.mcidCounter = 0;
  }

  private isTextShowingOp(op: string): op is TextShowingOperator {
    return ['Tj', 'TJ', "'", '"'].includes(op);
  }
}

// Helper function to process a pdf-lib page
async function addMCIDToPage(
  page: PDFPage,
  startMCID: number = 0
): Promise<Uint8Array> {
  const contentStreamRef = page.node.Contents();

  if (!contentStreamRef) {
    throw new Error('Page has no content stream');
  }

  // Get the content stream and decode it
  const contentStream = page.doc.context.lookup(contentStreamRef);

  if (!contentStream || contentStream.constructor.name !== 'PDFStream') {
    throw new Error('Invalid content stream');
  }

  const decodedStream = (contentStream as any).decode();

  // Parse, inject MCIDs, and regenerate
  const parser = new PDFStreamParser(decodedStream);
  const operations = parser.parse();

  const injector = new MCIDInjector(operations, { startMCID });
  const markedOperations = injector.addMCIDMarkers();

  const generator = new PDFStreamGenerator(markedOperations);
  return generator.generateBytes();
}

export {
  PDFStreamParser,
  PDFStreamGenerator,
  MCIDInjector,
  addMCIDToPage,
  type PDFOperation,
  type PDFOperand,
  type PDFString,
  type PDFHexString,
  type PDFNumber,
  type PDFName,
  type PDFArray,
  type PDFDictionary,
  type MCIDOptions,
  type TextShowingOperator,
  type GraphicsStateOperator,
  type PathOperator,
  type PaintOperator,
  type ColorOperator,
  type PDFOperatorType
};