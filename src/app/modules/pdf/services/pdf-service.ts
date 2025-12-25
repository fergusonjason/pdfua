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

}
