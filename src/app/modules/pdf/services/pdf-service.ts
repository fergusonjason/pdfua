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
import { hasFilter, inflate, isCompressedStream, isEncodedStream, streamToString } from '../functions/stream-utils';
import { PDFToken } from '../model/pdf-token';
import { parseOperators, tokenizeContentStream } from '../functions/token-utils';
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

    const pdfDoc: PDFDocument = await PDFDocument.load(input);
    const pages: PDFPage[] = pdfDoc.getPages();
    for (const page of pages) {
      const pageContentStreams: PDFStream[] = await this.extractContentStreams(pdfDoc, page);
      for (const stream of pageContentStreams) {

        // it's encoded, but may or may not be compressed
        // TODO: handle other encodings besides FlateDecode
        let rawStream;
        if (isEncodedStream(stream)) {
          console.log('Stream is encoded');
          if (hasFilter(stream, 'FlateDecode')) {
            rawStream = await inflate(stream.getContents());
          }
        } else {
          rawStream = stream.getContents();
        }


        if (rawStream) {
          if (this.debug) {
            const debugStream = streamToString(rawStream);
            console.log(`Debug stream: ${debugStream}`);
          }

          const tokens: PDFToken[] = tokenizeContentStream(rawStream);
          const operators: PDFOperator[] = parseOperators(tokens);
          for (const operator of operators) {
            // process operators
            if (operator.operator === 'Tj' || operator.operator === 'TJ') {
              console.log("breakpoint");
            }

            if (operator.operator === 'Tz') {
              console.log("breakpoint");
            }
          }
          console.log('breakpoint');

        }
      }

      // const contents = contentStream.getContents();
      console.log('breakpoint');
    }

    return pdfDoc;
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
    const contents: PDFObject | undefined = pageNode.get(PDFName.of('Contents'));
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

  private nextMCID(): number {
    const mcid = this.currentMCID;
    this.currentMCID += 1;
    return mcid;
  }

  // // entry point for the service
  // async reprocessPdfDocument(file: File): Promise<PDFDocument> {
  //   const pdfDoc: PDFDocument = await this.loadPdfDocument(file);
  //   const pdfPageLeafs: PDFPageLeaf[] = this.getPdfPageLeafs(pdfDoc); // get all the pages as PDFPageLeaf objects

  //   for (const pageLeaf of pdfPageLeafs) {
  //     const contents = await this.getPageLeafContents(pageLeaf, pdfDoc.context); // get the contents of the page
  //     console.log('breakpoint');
  //   }
  //   // for (const [key, raw] of pdfPageLeafs.entries()) {
  //   //   console.log('breakpoint');
  //   // }

  //   return pdfDoc;
  // }

  // private async loadPdfDocument(file: File): Promise<PDFDocument> {
  //   const arrayBuffer = await file.arrayBuffer();
  //   const pdfDoc = await PDFDocument.load(arrayBuffer);
  //   return pdfDoc;
  // }

  // /**
  //  * the leaf is the page dictionary. There is no spoon.
  //  * @param pdfDoc
  //  * @returns
  //  */
  // private getPdfPageLeafs(pdfDoc: PDFDocument): PDFPageLeaf[] {
  //   const result = pdfDoc.getPages().map((page) => page.node);
  //   return result;
  // }

  // private async getPageLeafContents(
  //   pageLeaf: PDFPageLeaf,
  //   context: any
  // ): Promise<string[]> {
  //   // get the Contents in order to get the reference to the stream
  //   // get /Contents as a PDFRef
  //   let pageContentsRef = pageLeaf.get(PDFName.of('Contents'));
  //   if (pageContentsRef) {
  //     pageContentsRef = pageContentsRef as PDFRef;
  //     return [];
  //   }

  //   const pageContents = context.get(pageContentsRef); // get the object with the stream

  //   const unwappedRawContents = this.unwrap(pageContents); // unwrap the object to get the reference to the stream

  //   // try to get the reference to the object with the stream
  //   const contents = this.resolve(pageContents, context);

  //   // Step 3: detect PDFArray *after* resolving
  //   if (contents.constructor?.name === 'PDFArray') {
  //     const refs = contents.asArray(); // now a JS array of PDFRefs
  //     return this.getArrayStream(refs, context);
  //   }

  //   // Step 4: single stream
  //   return this.getSingleStream(contents, context);
  // }

  // private async getSingleStream(ref: any, context: any): Promise<string[]> {
  //   const stream = this.resolve(ref, context);
  //   const raw = stream.getContents();
  //   const filter = stream.dict.get('Filter');
  //   if (!filter) {
  //     return [new TextDecoder().decode(raw)];
  //   }
  //   return [await this.getCompressedStream(raw, filter)];
  // }

  // private async getArrayStream(refs: any[], context: any): Promise<string[]> {
  //   const results: string[] = [];
  //   for (const ref of refs) {
  //     const stream = this.resolve(ref, context);
  //     const raw = stream.getContents();
  //     const filter = stream.dict.get('Filter');
  //     if (!filter) {
  //       results.push(new TextDecoder().decode(raw));
  //     } else {
  //       results.push(await this.getCompressedStream(raw, filter));
  //     }
  //   }
  //   return results;
  // }

  // private async getCompressedStream(
  //   raw: Uint8Array,
  //   filter: any
  // ): Promise<string> {
  //   const filters = Array.isArray(filter) ? filter : [filter];
  //   let data = raw;
  //   for (const f of filters) {
  //     const name = f.asName();
  //     if (name === 'FlateDecode') {
  //       data = await inflate(data);
  //     } else {
  //       console.warn(`Unsupported filter: ${name}`);
  //     }
  //   }
  //   return new TextDecoder().decode(data);
  // }

  // private resolve(obj: any, context: any): any {
  //   // If it's a PDFRef, look up the actual object in the PDFContext
  //   if (obj?.constructor?.name === 'PDFRef') {
  //     return context.lookup(obj);
  //   }

  //   // Otherwise it's already a concrete PDF object (PDFDict, PDFStream, PDFArray, etc.)
  //   return obj;
  // }

  // private unwrap(obj: any): any {
  //   let current = obj;
  //   while (current?.constructor?.name === 'PDFObject2') {
  //     current = current.value();
  //   }
  //   return current;
  // }
}
