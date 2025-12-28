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
import { getAllPageRefs } from '../functions/stream-utils';
import { deflateStream } from '../functions/transformers/deflate-stream-transformer';
import { inflateStream } from '../functions/transformers/inflate-stream-transformer';
import { MCIDCounter } from '../functions/transformers/mcid-counter';
import { createMcidStreamTransformer } from '../functions/transformers/mcid-insert-stream-transformer';
import { PDF_NAME_PAGES } from './../constants/pdf-name';

@Injectable({
  providedIn: 'root',
})
export class PdfService {

  constructor() { }

  async reprocessPDF2(input:Uint8Array): Promise<Uint8Array> {

    const pdfDoc: PDFDocument = await PDFDocument.load(input);
    const pdfContext: PDFContext = pdfDoc.context;
    const catalogRef = pdfContext.trailerInfo.Root; // PDFRef
    const catalog = pdfContext.lookup(catalogRef); // PDFDict

    if (!(catalog instanceof PDFDict)) {
      throw new Error("Invalid PDF: Catalog is not a dictionary");
    }

    const pagesRef = catalog.get(PDF_NAME_PAGES);
    if (!pagesRef || !(pagesRef instanceof PDFRef)) {
      throw new Error("Invalid PDF: Catalog missing /Pages reference");
    }

    // let's get the /Kids and walk them to get PDFRef for a /Type /Page
    const pagesDict: PDFDict = pdfContext.lookup(pagesRef) as PDFDict;
    const pageRefs: PDFRef[] = getAllPageRefs(pagesDict, pdfContext);

    for (const pageRef of pageRefs) {
      const pageObj: PDFObject | undefined = pdfContext.lookup(pageRef);
      if (!pageObj) {
        continue;
      }

      if (pageObj instanceof PDFStream) {

        // can be PDFName, PDFArray, undefined
        const filters = pageObj.dict.get(PDFName.of('Filter'));
        const filterNames: PDFName[] = this.normalizeFilters(filters);

        // pass this to the mcid transformer factory function so I can keep
        // a running counter for all the pages
        const mcidCounter = new MCIDCounter(0);

        // build the stream transform pipeline
        // the pipeline build can probably be a little easier to read
        const pipeline = [];

        const hasFlateDecodeFilter = this.hasFilter('FlateDecode', filterNames);

        // if flate decode is in the filters, we need to add inflate/deflate steps
        if (hasFlateDecodeFilter) {
          pipeline.push(inflateStream);
        }

        // insert MCID needs to be inside the pipeline array
        pipeline.push(createMcidStreamTransformer(mcidCounter));

        if (hasFlateDecodeFilter) {
          pipeline.push(deflateStream);
        }

        // eventually we need to support more decoders than FlateDecode, that's
        // why we do these as functional transformers

        // now we run a reduce() on the pipeline to process the stream
        let processedStream1 = pageObj.getContents();
        for (const transformFm of pipeline) {
          processedStream1 = await transformFm(processedStream1);
        }

        // do we need to rebuild the PDFstream object entirely or just
        // replace the contents
        const newDict = pageObj.dict.clone(pdfContext);
        const test: Record<string, any> ={
          ...newDict
        };
        const newStream = pdfContext.stream(processedStream1, test);

        // update the PDFDocument context with the new stream
        pdfContext.assign(pageRef, newStream);
      }
    }

    return pdfDoc.save();

  }

  private normalizeFilters(f: PDFObject | undefined): PDFName[] {
    if (!f) return [];
    if (f instanceof PDFName) return [f];
    if (f instanceof PDFArray) return f.asArray().filter(x => x instanceof PDFName) as PDFName[];
    return [];
  }

  private hasFilter(candidate: string, filterNames: PDFName[]): boolean {
    const result = filterNames.some((item) => item === PDFName.of(candidate));
    return result;
  }






}
