import { Component } from '@angular/core';
import { PDFContext, PDFDocument, PDFPageLeaf } from 'pdf-lib';
import { PdfService } from '../../services/pdf-service';
import { saveAs } from 'file-saver';


@Component({
  selector: 'pdf-parent',
  imports: [],
  templateUrl: './pdf-parent.html',
  styleUrl: './pdf-parent.css',
})
export class PdfParent {

  selectedFile: File | null = null;

  constructor(private readonly pdfService: PdfService) {}

  async onFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const processed = await this.pdfService.reprocessPDF(bytes);
      let pdfBytes = await processed.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      saveAs(blob, 'processed.pdf');
    } catch (error) {
      console.error('Error processing PDF:', error);
    }

  }


  // async onFileUpload(event: Event): Promise<void> {

  //   const input = event.target as HTMLInputElement;
  //   const file = input.files?.[0];
  //   if (file) {
  //     this.selectedFile = file;
  //     const pdfDoc: PDFDocument = await this.pdfService.reprocessPDF(file);
  //     // const pdfDoc: PDFDocument = await this.pdfService.loadPdfDocument(file);
  //     // for (const page of pdfDoc.getPages()) {
  //     //   const context: PDFContext = pdfDoc.context;
  //     //   const pages: PDFPageLeaf[] = this.getPdfPageLeafs(pdfDoc);
  //     //   console.log("breakpoint");
  //     // }
  //   } else {
  //     console.error('No file selected');
  //   }
  // }



}
