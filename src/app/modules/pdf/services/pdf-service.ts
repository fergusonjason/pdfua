import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
  PDFStream,
} from 'pdf-lib';
import {
  decodeStream,
  hasFilter,
  inflate,
  isCompressedStream,
  isEncodedStream,
  streamToString,
} from '../functions/stream-utils';
import { PDFToken } from '../model/pdf-token';
import {
  parseOperators,
  tokenizeContentStream,
} from '../functions/token-utils';
import { PDFOperator } from '../model/pdf-operator';

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  private currentMCID: number;

  private debug: boolean = true;

  constructor() {
    this.currentMCID = 0;
  }

async reprocessPDF(input: Uint8Array): Promise<PDFDocument> {
  const pdfDoc = await PDFDocument.load(input);
  const pages = pdfDoc.getPages();

  // Collect MCID mappings for the StructTree
  const pageBlocks: { pageRef: PDFRef, mcids: number[] }[] = [];

  for (const page of pages) {
    const streams = this.getContentStreamRefs(page);

    for (const streamRef of streams) {
      const stream = pdfDoc.context.lookup(streamRef) as PDFStream;

      const rawStream: Uint8Array | undefined = await decodeStream(stream);
      if (!rawStream) {
        continue;
      }

      const reprocessedStream: Uint8Array = this.parseStream(rawStream);

      const pageMcids: number[] = this.extractMCIDsFromStream(reprocessedStream);

      pageBlocks.push({ pageRef: page.ref, mcids: pageMcids });

      const newPdfStream = pdfDoc.context.flateStream(reprocessedStream);

      const contents = page.node.get(PDFName.of('Contents'));

      if (contents instanceof PDFRef) {
        page.node.set(PDFName.of('Contents'), newPdfStream);
      }

      if (contents instanceof PDFArray) {
        const arr = contents.asArray();
        const index = arr.indexOf(streamRef);
        if (index !== -1) {
          contents.set(index, newPdfStream);
        }
      }
    }
  }

  this.createStructTree(pdfDoc, pageBlocks);
  return pdfDoc;
}

private parseStream(rawStream: Uint8Array): Uint8Array {

  const tokens = tokenizeContentStream(rawStream);
  const operators = parseOperators(tokens);

  // TODO: Deal with image blocks
  const blocks = this.extractLogicalTextBlocks(operators);

  let mcid = this.currentMCID;
  const rewrittenBlocks: PDFOperator[][] = [];

  for (const block of blocks) {
    const { operators: tagged, nextMCID } =
      this.insertMCIDsIntoBlock(block.operators, mcid);

    rewrittenBlocks.push(tagged);
    mcid = nextMCID;
  }

  // Update global MCID counter
  this.currentMCID = mcid;

  // 5. Flatten back into a single operator list
  const finalOps = rewrittenBlocks.flat();

  // 6. Serialize operators back into a PDF content stream
  const newStreamString = this.serializeOperators(finalOps);
  return new TextEncoder().encode(newStreamString);
}

  private async extractContentStreams(
    document: PDFDocument,
    page: PDFPage
  ): Promise<PDFStream[]> {
    const results: PDFStream[] = [];
    const refs = this.getContentStreamRefs(page);

    for (const ref of refs) {
      const stream = document.context.lookup(ref) as PDFStream;
      results.push(stream);
    }

    return results;
  }

  private getContentStreamRefs(page: PDFPage): PDFRef[] {

    const pageNode: PDFPageLeaf = page.node;
    const contents: PDFObject | undefined = pageNode.get(
      PDFName.of('Contents')
    );
    if (!contents) {
      return [];
    }

    if (contents instanceof PDFRef) {
      return [contents];
    }
    if (contents instanceof PDFArray) {
      return contents
        .asArray()
        .filter((el) => el instanceof PDFRef) as PDFRef[];
    }
    return [];
  }

  private extractLogicalTextBlocks(ops: PDFOperator[]) {
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

private insertMCIDsIntoBlock(
  block: PDFOperator[],
  startMCID: number
): { operators: PDFOperator[], nextMCID: number } {

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
        operands: ['Span', { MCID: mcid }]
      });

      out.push(op);

      out.push({
        operator: 'EMC',
        operands: []
      });

      mcid++;
      continue;
    }

    out.push(op);
  }

  return { operators: out, nextMCID: mcid };
}

private serializeOperators(ops: PDFOperator[]): string {
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

private createStructTree(
  pdfDoc: PDFDocument,
  pageBlocks: {
    pageRef: PDFRef,
    mcids: number[]
  }[]
) {
  const ctx = pdfDoc.context;

  //
  // --- 1. Create /K array for StructTreeRoot ---
  //
  const kArray = ctx.obj([]) as PDFArray;

  //
  // --- 2. Create StructTreeRoot dictionary ---
  //
  const structTreeRoot = ctx.obj({
    Type: 'StructTreeRoot',
    K: kArray,
    RoleMap: {
      P: 'P',
      Span: 'Span',
      Figure: 'Figure'
    }
  });

  const structTreeRootRef = ctx.register(structTreeRoot);

  //
  // --- 3. Prepare ParentTree /Nums array ---
  //
  const parentNums = ctx.obj([]) as PDFArray;

  //
  // --- 4. Create StructElem + MCR entries for each block ---
  //
  for (const block of pageBlocks) {

    // Create /K array for this StructElem
    const elemK = ctx.obj([]) as PDFArray;

    // Create StructElem
    const structElem = ctx.obj({
      Type: 'StructElem',
      S: 'P',              // Paragraph for now
      Pg: block.pageRef,
      K: elemK
    });

    const structElemRef = ctx.register(structElem);

    // Add StructElem to StructTreeRoot.K
    kArray.push(structElemRef);

    // Create MCR entries for each MCID in this block
    for (const mcid of block.mcids) {
      const mcr = ctx.obj({
        Type: 'MCR',
        Pg: block.pageRef,
        MCID: mcid
      });

      const mcrRef = ctx.register(mcr);

      // Add MCR to StructElem.K
      elemK.push(mcrRef);

      // Add MCID → StructElemRef mapping to ParentTree.Nums
      parentNums.push(ctx.obj(mcid));
      parentNums.push(structElemRef);
    }
  }

  //
  // --- 5. Create ParentTree dictionary ---
  //
  const parentTree = ctx.obj({
    Nums: parentNums
  });

  const parentTreeRef = ctx.register(parentTree);

  // Attach ParentTree to StructTreeRoot
  structTreeRoot.set(PDFName.of('ParentTree'), parentTreeRef);

  //
  // --- 6. Attach StructTreeRoot to Catalog ---
  //
  pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
}

private extractMCIDsFromStream(streamBytes: Uint8Array): number[] {
  const mcids: number[] = [];

  // 1. Tokenize
  const tokens: PDFToken[] = tokenizeContentStream(streamBytes);

  // 2. Parse operators
  const operators: PDFOperator[] = parseOperators(tokens);

  // 3. Scan for BDC operators with MCID dictionaries
  for (const op of operators) {
    if (op.operator === 'BDC') {
      const dict = op.operands[1];
      if (dict && typeof dict.MCID === 'number') {
        mcids.push(dict.MCID);
      }
    }
  }

  return mcids;
}

  private nextMCID(): number {
    const mcid = this.currentMCID;
    this.currentMCID += 1;
    return mcid;
  }
}
