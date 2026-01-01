import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
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

    // okay, so we're not getting the references of the page content objects, so
    // we're not running them through the transformers

    for (const pageRef of pageRefs) {
      const pageObj: PDFObject | undefined = pdfContext.lookup(pageRef);
      if (!pageObj || !(pageObj instanceof PDFDict)) {
        continue;
      }

      // Get the /Contents entry from the page dictionary
      const contentsEntry = pageObj.get(PDFName.of('Contents'));
      if (!contentsEntry) {
        continue; // Page has no content
      }

      // Contents can be a single stream reference or an array of stream references
      const contentRefs: PDFRef[] = [];
      if (contentsEntry instanceof PDFRef) {
        contentRefs.push(contentsEntry);
      } else if (contentsEntry instanceof PDFArray) {
        // Handle array of content streams
        for (let i = 0; i < contentsEntry.size(); i++) {
          const ref = contentsEntry.get(i);
          if (ref instanceof PDFRef) {
            contentRefs.push(ref);
          }
        }
      }

      const mcidCounter: MCIDCounter = new MCIDCounter(0);

      for (const contentRef of contentRefs) {
        const contentStream = pdfContext.lookup(contentRef);
        if (!(contentStream instanceof PDFStream)) {
          continue;
        }

        const filters = contentStream.dict.get(PDFName.of('Filter'));
        const filterNames: PDFName[] = this.normalizeFilters(filters);

        // Build the stream transform pipeline
        const pipeline = [];
        const hasFlateDecodeFilter = this.hasFilter('FlateDecode', filterNames);

        if (hasFlateDecodeFilter) {
          pipeline.push(inflateStream);
        }

        console.log("MCID counter before pipeline:", mcidCounter.current());
        pipeline.push(createMcidStreamTransformer(mcidCounter));
        console.log("MCID counter after pipeline:", mcidCounter.current());

        if (hasFlateDecodeFilter) {
          pipeline.push(deflateStream);
        }

        // Process the stream through the pipeline
        let processedStream = contentStream.getContents();
        for (const transformFn of pipeline) {
          processedStream = await transformFn(processedStream);
        }

        // Create new stream with processed contents
        // const newDict = contentStream.dict.clone(pdfContext);
        const newDict = contentStream.dict.clone(pdfContext);
        newDict.set(PDFName.of('Length'), PDFNumber.of(processedStream.length));
        const newStream = PDFRawStream.of(newDict, processedStream);


        // Update the content stream reference in the context
        pdfContext.assign(contentRef, newStream);
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
