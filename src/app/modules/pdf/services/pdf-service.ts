import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream
} from 'pdf-lib';
import { getPageContentRefs, rebuildPDFfromMap } from '../functions/pdf-object-utils';
import {
  decodeStream
} from '../functions/stream-utils';
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

  constructor() {
    this.currentMCID = 0;
  }


  async reprocessPDF(input: Uint8Array): Promise<Uint8Array> {

    const pdfDoc: PDFDocument = await PDFDocument.load(input);

    // build map of the objects in the PDF
    // const pdfObjectMap: Map<PDFRef, PDFObject> = this.getObjectMap(pdfDoc);

    // iterate the pages, get the PDFRef of the page content streams
    // First get /Type /Page objects, then follow the /Contents reference(s)
    const pageContentRefs: Set<PDFRef> = getPageContentRefs(pdfDoc);

    // iterate the actual page contents streams
    for (const ref of pageContentRefs) {

      // get the object from the PDFDocument context
      const obj = pdfDoc.context.lookup(ref);
      if (obj instanceof PDFStream) {
        const stream = obj;
        // const stream = obj as PDFStream;

        // decode the stream from the object, may or may not be deflated
        const decodedStream: Uint8Array = await decodeStream(stream);

        // this is the stream that has been through the processors (MCID insert, etc)
        const reprocessedStream: Uint8Array = this.parseStream(decodedStream);

        // Access the internal contents via the PDFRawStream
        if (obj instanceof PDFRawStream) {
          // Directly modify the internal buffer
          (obj as any).contents = reprocessedStream;

          // Update Length in dictionary
          obj.dict.set(
            pdfDoc.context.obj('Length'),
            pdfDoc.context.obj(reprocessedStream.length)
          );
      }
        // Create new PDFRawStream (uncompressed)
        // const newRawStream = PDFRawStream.of(
        //   obj.dict.clone(pdfDoc.context),
        //   reprocessedStream
        // );

        // // Update the object in the context
        // pdfDoc.context.assign(ref, newRawStream);

        // compress the stream back into a PDFRawStream
        // const newStream: PDFRawStream = pdfDoc.context.flateStream(reprocessedStream);

        // replace the original with the reprocessed stream
        // pdfObjectMap.set(ref, newStream);

      }
    }

    const newPdfBytes = await pdfDoc.save();
    // const newPdfDoc = await rebuildPDFfromMap(pdfObjectMap, pdfDoc);
    // const newPdfBytes = newPdfDoc.save();
    return newPdfBytes;
  }


  /**
   * Create a Map<PDFRef, PDFObject> for all indirect objects in the PDFDocument
   *
   * @param pdfDoc
   * @returns
   */
  private getObjectMap(pdfDoc: PDFDocument): Map<PDFRef, PDFObject> {
    const objMap = new Map<PDFRef, PDFObject>();
    const context = pdfDoc.context;

    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      objMap.set(ref, obj);
    }

    return objMap;
  }


/**
 *
 * @param rawStream Parse the stream from the PDFObject (PDFRawStream)
 * @returns
 */
  private parseStream(rawStream: Uint8Array): Uint8Array {

    const tokens = tokenizeContentStream(rawStream);
    const operators = parseOperators(tokens);

    // TODO: Deal with image blocks
    const blocks = this.extractLogicalTextBlocks(operators);

    let mcid = this.currentMCID;
    const rewrittenBlocks: PDFOperator[][] = [];

    for (const block of blocks) {
      const { operators: tagged, nextMCID } = this.insertMCIDsIntoBlock(
        block.operators,
        mcid
      );

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

}
