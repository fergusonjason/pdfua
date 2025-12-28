import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRef,
  PDFStream
} from 'pdf-lib';
import { deflateStream } from '../functions/transformers/deflate-stream-transformer';
import { inflateStream } from '../functions/transformers/inflate-stream-transformer';
import { mcidInsertStreamTransformer } from '../functions/transformers/mcid-insert-stream-transformer';
import { getAllPageRefs } from '../functions/stream-utils';

@Injectable({
  providedIn: 'root',
})
export class PdfService {

  currentMCID: number = 0;


  constructor() {

  }

  private static readonly PDF_NAME_TYPE = PDFName.of('Type');
  private static readonly PDF_NAME_PAGE = PDFName.of('Page');
  private static readonly PDF_NAME_PAGES = PDFName.of('Pages');
  private static readonly PDF_NAME_KIDS = PDFName.of('Kids');
  private static readonly PDF_NAME_CATALOG = PDFName.of('Catalog');

  async reprocessPDF2(input:Uint8Array): Promise<Uint8Array> {

    const pdfDoc: PDFDocument = await PDFDocument.load(input);
    const pdfContext: PDFContext = pdfDoc.context;
    const catalogRef = pdfContext.trailerInfo.Root; // PDFRef
    const catalog = pdfContext.lookup(catalogRef); // PDFDict

    if (!(catalog instanceof PDFDict)) {
      throw new Error("Invalid PDF: Catalog is not a dictionary");
    }

    const pagesRef = catalog.get(PdfService.PDF_NAME_PAGES);
    if (!pagesRef || !(pagesRef instanceof PDFRef)) {
      throw new Error("Invalid PDF: Catalog missing /Pages reference");
    }

    // let's get the /Kids and walk them to get PDFRef for a /Type /Page
    const pagesDict: PDFDict = pdfContext.lookup(pagesRef) as PDFDict;
    const pageRefs: PDFRef[] = getAllPageRefs(pagesDict, pdfContext);

    for (const pageRef of pageRefs) {
      const pageObj = pdfContext.lookup(pageRef);
    }

    return new Uint8Array(0);
  }

async reprocessPDF(input: Uint8Array): Promise<Uint8Array> {

  const pdfDoc: PDFDocument = await PDFDocument.load(input);
  const pdfContext: PDFContext = pdfDoc.context;

  for (const [pdfRef, pdfObject] of pdfContext.enumerateIndirectObjects()) {
    if (pdfObject instanceof PDFDict) {
      const pdfDict = pdfObject as PDFDict;
      console.log(`Found dictionary, type: ${pdfDict.get(PdfService.PDF_NAME_TYPE)}, ref: ${pdfRef.toString()}`);

    } else if (pdfObject instanceof PDFStream) {
      const pdfStream = pdfObject as PDFStream;
      const parentRefs = this.findStreamParents(pdfContext, pdfRef);
      const hasPageParent = parentRefs.some((item) =>
        this.isPdfObjectType(PdfService.PDF_NAME_PAGE, item, pdfContext)
      );

      if (hasPageParent) {
        console.log(`Found stream belonging to a Page object, ref: ${pdfRef.toString()}, parent ref(s): ${JSON.stringify(parentRefs)}`);

        let mcidCounter = 0;

        let rawStream: Uint8Array = pdfStream.getContents();
        rawStream = await inflateStream(rawStream) as Uint8Array;
        const oldMcid = mcidCounter;
        rawStream = await mcidInsertStreamTransformer(rawStream, mcidCounter);
        const newMcid = mcidCounter;
        console.log(`Processed stream ref ${pdfRef.toString()}: MCIDs ${oldMcid} → ${newMcid}`);
        rawStream = await deflateStream(rawStream) as Uint8Array;

        const test =pdfContext.stream(rawStream);

        console.log("Attempting to assign PDFStream to reference " + pdfRef.toString());
        pdfContext.assign(pdfRef, test);

      } else {
        console.log("Unsupported stream type");
      }
    }

  }

  const objectCount = pdfContext.enumerateIndirectObjects().length;
  console.log("Indirect object count after processing: " + objectCount);

  return pdfDoc.save();
}


  // async reprocessPDF(input: Uint8Array): Promise<Uint8Array> {

  //   const pdfDoc: PDFDocument = await PDFDocument.load(input);
  //   const pdfContext:PDFContext = pdfDoc.context;
  //   for (const [pdfRef, pdfObject] of pdfContext.enumerateIndirectObjects()) {
  //     if (pdfObject instanceof PDFDict) {
  //       const pdfDict = pdfObject as PDFDict;
  //       // const typeName = PDFName.of('Type');
  //       console.log(`Found dictionary, type: ${pdfDict.get(PdfService.PDF_NAME_TYPE)}, ref: ${pdfRef.toString()}`);
  //     } else if (pdfObject instanceof PDFStream) {
  //       const pdfStream = pdfObject as PDFStream;
  //       const parentRefs = this.findStreamParents(pdfContext, pdfRef);
  //       const hasPageParent = parentRefs.some((item) => this.isPdfObjectType(PdfService.PDF_NAME_PAGE, item, pdfContext));
  //       if (hasPageParent) {
  //         console.log(`Found stream belonging to a Page object, ref: ${pdfRef.toString()}, parent ref(s): ${JSON.stringify(parentRefs)}`);
  //       } else {
  //         const parentTypes = parentRefs.map((item) => {
  //           if (!item) return null;
  //           const obj = pdfContext.lookup(item);
  //           if (!(obj instanceof PDFDict)) return null;
  //           const dict = obj as PDFDict;
  //           const type = dict.get(PdfService.PDF_NAME_TYPE);
  //           return type;
  //         });
  //         console.log(`Found stream, ref: ${pdfRef.toString()}, parentRefs: ${JSON.stringify(parentRefs)}), parentTypes: ${JSON.stringify(parentTypes)}`);
  //       }


  //       // we need to find the parent to see if we actually need to decode it

  //       console.log(`Object ref: ${pdfRef}, Parents: ${JSON.stringify(parentRefs.map((item) => `${item.tag} (isPage: ${this.isPageRef(pdfContext, item)})`))}`);


  //     }
  //   }

  //   return pdfDoc.save();

  // }

  private isPdfObjectType(typeName: PDFName, pdfRef: PDFRef,  context: PDFContext): boolean {
    const obj = context.lookup(pdfRef);
    if (!obj || !(obj instanceof PDFDict)) {
      return false;
    }

    const dict = obj as PDFDict;
    const type = dict.get(PdfService.PDF_NAME_TYPE);
    if (type && type instanceof PDFName && type === typeName) {
      return true;
    }

    return false;
  }



private findStreamParents(
  context: PDFContext,
  streamRef: PDFRef
): PDFRef[] {
  const streamObj = context.lookup(streamRef);

  // If it's not a stream, nothing to do
  if (!(streamObj instanceof PDFStream)) {
    return [];
  }

  const parents: PDFRef[] = [];

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (ref === streamRef) continue;

    if (this.objectReferencesRef(obj, streamRef)) {
      parents.push(ref);
    }
  }

  return parents;
}

  private objectReferencesRef(obj: PDFObject, targetRef: PDFRef): boolean {
    // Direct reference
    if (obj === targetRef) return true;

    // Dict
    if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) {
        if (value === targetRef) return true;
        if (value instanceof PDFObject && this.objectReferencesRef(value, targetRef)) {
          return true;
        }
      }
    }

    // Array
    if (obj instanceof PDFArray) {
      for (const value of obj.asArray()) {
        if (value === targetRef) return true;
        if (value instanceof PDFObject && this.objectReferencesRef(value, targetRef)) {
          return true;
        }
      }
    }

    // Stream → only search its dict
    if (obj instanceof PDFStream) {
      return this.objectReferencesRef(obj.dict, targetRef);
    }

    return false;
  }

private isPageRef(context: PDFContext, ref: PDFRef): boolean {
  const obj = context.lookup(ref);

  // Must be a dictionary
  if (!(obj instanceof PDFDict)) return false;

  // Must have /Type /Page
  const type = obj.get(PDFName.of('Type'));
  if (!(type instanceof PDFName)) return false;

  return type.decodeText() === 'Page';
}


/**
 *
 * @param rawStream Parse the stream from the PDFObject (PDFRawStream)
 * @returns
 */
  // private parseStream(rawStream: Uint8Array): Uint8Array {

  //   const tokens = tokenizeContentStream(rawStream);
  //   const operators = parseOperators(tokens);

  //   // TODO: Deal with image blocks
  //   const blocks = this.extractLogicalTextBlocks(operators);

  //   let mcid = this.currentMCID;
  //   const rewrittenBlocks: PDFOperator[][] = [];

  //   for (const block of blocks) {
  //     const { operators: tagged, nextMCID } = this.insertMCIDsIntoBlock(
  //       block.operators,
  //       mcid
  //     );

  //     rewrittenBlocks.push(tagged);
  //     mcid = nextMCID;
  //   }

  //   // Update global MCID counter
  //   this.currentMCID = mcid;

  //   // 5. Flatten back into a single operator list
  //   const finalOps = rewrittenBlocks.flat();

  //   // 6. Serialize operators back into a PDF content stream
  //   const newStreamString = this.serializeOperators(finalOps);
  //   return new TextEncoder().encode(newStreamString);
  // }

//   private parseStream(rawStream: Uint8Array): Uint8Array {
//   // 1. Segment the stream into operator and binary chunks
//   const segments = this.segmentContentStream(rawStream);

//   const rewritten: Uint8Array[] = [];
//   let mcid = this.currentMCID;

//   for (const segment of segments) {
//     if (segment.type === 'operators') {
//       // 2. Tokenize and parse only operator segments
//       const tokens = tokenizeContentStream(segment.bytes);
//       const ops = parseOperators(tokens);

//       // 3. Extract logical blocks and insert MCIDs
//       const blocks = this.extractLogicalTextBlocks(ops);

//       const rewrittenOps: PDFOperator[] = [];
//       for (const block of blocks) {
//         const { operators: tagged, nextMCID } =
//           this.insertMCIDsIntoBlock(block.operators, mcid);

//         rewrittenOps.push(...tagged);
//         mcid = nextMCID;
//       }

//       // 4. Serialize operators back to bytes
//       const serialized = this.serializeOperatorsToBytes(rewrittenOps);
//       rewritten.push(serialized);

//     } else {
//       // 5. Binary segment → preserve exactly
//       rewritten.push(segment.bytes);
//     }
//   }

//   // Update global MCID counter
//   this.currentMCID = mcid;

//   // 6. Concatenate all segments back into a single stream
//   return this.concatUint8Arrays(rewritten);
// }

// private segmentContentStream(bytes: Uint8Array): Array<{ type: 'operators' | 'binary', bytes: Uint8Array }> {
//   const segments = [];
//   let i = 0;

//   while (i < bytes.length) {
//     // Detect inline image: BI ... ID ... EI
//     if (this.isInlineImageStart(bytes, i)) {
//       const { end, segment } = this.extractInlineImage(bytes, i);
//       segments.push({ type: 'binary', bytes: segment });
//       i = end;
//       continue;
//     }

//     // Otherwise treat as operator text until next binary region
//     const { end, segment } = this.extractOperatorRegion(bytes, i);
//     segments.push({ type: 'operators', bytes: segment });
//     i = end;
//   }

//   return segments;
// }

// private serializeOperatorsToBytes(ops: PDFOperator[]): Uint8Array {
//   const text = this.serializeOperators(ops); // your existing serializer
//   return new TextEncoder().encode(text);
// }

// private concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
//   const total = chunks.reduce((sum, c) => sum + c.length, 0);
//   const out = new Uint8Array(total);

//   let offset = 0;
//   for (const chunk of chunks) {
//     out.set(chunk, offset);
//     offset += chunk.length;
//   }
//   return out;
// }


  // private extractLogicalTextBlocks(ops: PDFOperator[]) {
  //   const blocks: { type: 'text'; operators: PDFOperator[] }[] = [];
  //   let current: PDFOperator[] | null = null;
  //   for (const op of ops) {
  //     if (op.operator === 'BT') {
  //       current = [op];
  //       continue;
  //     }
  //     if (op.operator === 'ET') {
  //       if (current) {
  //         current.push(op);
  //         blocks.push({ type: 'text', operators: current });
  //         current = null;
  //       }
  //       continue;
  //     }
  //     if (current) {
  //       current.push(op);
  //     }
  //   }
  //   return blocks;
  // }

  // private insertMCIDsIntoBlock(
  //   block: PDFOperator[],
  //   startMCID: number
  // ): { operators: PDFOperator[]; nextMCID: number } {
  //   const out: PDFOperator[] = [];
  //   let mcid = startMCID;

  //   for (const op of block) {
  //     if (op.operator === 'BT' || op.operator === 'ET') {
  //       out.push(op);
  //       continue;
  //     }

  //     const isText =
  //       op.operator === 'Tj' ||
  //       op.operator === 'TJ' ||
  //       op.operator === "'" ||
  //       op.operator === '"';

  //     if (isText) {
  //       out.push({
  //         operator: 'BDC',
  //         operands: ['Span', { MCID: mcid }],
  //       });

  //       out.push(op);

  //       out.push({
  //         operator: 'EMC',
  //         operands: [],
  //       });

  //       mcid++;
  //       continue;
  //     }

  //     out.push(op);
  //   }

  //   return { operators: out, nextMCID: mcid };
  // }

  // private serializeOperators(ops: PDFOperator[]): string {
  //   let out = '';

  //   for (const op of ops) {
  //     for (const operand of op.operands) {
  //       if (typeof operand === 'string') {
  //         if (operand.startsWith('/')) out += operand + ' ';
  //         else out += `(${operand}) `;
  //       } else if (typeof operand === 'number') {
  //         out += operand + ' ';
  //       } else if (Array.isArray(operand)) {
  //         out += '[';
  //         for (const item of operand) {
  //           if (typeof item === 'string') out += `(${item}) `;
  //           else out += item + ' ';
  //         }
  //         out += '] ';
  //       } else if (typeof operand === 'object') {
  //         out += '<< ';
  //         for (const key in operand) {
  //           out += `/${key} ${operand[key]} `;
  //         }
  //         out += '>> ';
  //       }
  //     }

  //     out += op.operator + '\n';
  //   }

  //   return out;
  // }

}
