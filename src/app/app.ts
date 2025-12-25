import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PdfParent } from './modules/pdf/components/pdf-parent/pdf-parent';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    PdfParent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('pdfua');
}
