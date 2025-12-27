import { Component } from '@angular/core';
import { PDFContext, PDFDocument, PDFPageLeaf } from 'pdf-lib';
import { PdfService } from '../../services/pdf-service';
import { saveAs } from 'file-saver';
import { debugPagesTree } from '../../functions/pdf-object-utils';


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

      const newPdfBytes = await this.pdfService.reprocessPDF(bytes);
      const blob = new Blob([new Uint8Array(newPdfBytes)], { type: 'application/pdf' });
      // const processed = await this.pdfService.reprocessPDF(bytes);
      // debugPagesTree(processed.context);
      // let pdfBytes = await processed.save();  // THIS GOES BOOM
      //const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      saveAs(blob, 'processed.pdf');
    } catch (error) {
      console.error('Error processing PDF:', error);
    }

  }


}
