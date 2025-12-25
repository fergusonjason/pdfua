export type PDFToken =
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'string'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'arrayStart' }
  | { type: 'arrayEnd' }
  | { type: 'dictStart' }
  | { type: 'dictEnd' }
  | { type: 'other'; value: string }
  | { type: 'inlineImage'; dict: string; data: Uint8Array };
