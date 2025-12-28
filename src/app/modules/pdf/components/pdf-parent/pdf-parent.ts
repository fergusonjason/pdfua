import { Component } from '@angular/core';
import { saveAs } from 'file-saver';

import { PdfService } from '../../services/pdf-service';


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

      const newPdfBytes: Uint8Array = await this.pdfService.reprocessPDF2(bytes);

      // this is to get around a stupid SharedArrayBuffer issue and Blob
      // can't use it as a BlobPart
      const safeBytes = new Uint8Array(newPdfBytes.length);
      safeBytes.set(newPdfBytes);
      const blob = new Blob([safeBytes], { type: 'application/pdf' });


      saveAs(blob, 'processed.pdf');
    } catch (error) {
      console.error('Error processing PDF:', error);
    }

  }


}
