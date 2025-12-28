export type ContentStreamSegmentType = 'operators' | 'binary';

export interface ContentStreamSegment {
  type: ContentStreamSegmentType;
  bytes: Uint8Array;
}

export class ContentStreamTokenizer {

  public static segment(raw: Uint8Array): ContentStreamSegment[] {
    const segments: ContentStreamSegment[] = [];
    let offset = 0;

    while (offset < raw.length) {

      // Inline image detection
      if (this.isInlineImageStart(raw, offset)) {
        const { endOffset, segment } = this.extractInlineImage(raw, offset);
        segments.push({ type: 'binary', bytes: segment });
        offset = endOffset;
        continue;
      }

      // Operator region
      const { endOffset, segment } = this.extractOperatorRegion(raw, offset);
      if (segment.length > 0) {
        segments.push({ type: 'operators', bytes: segment });
      }
      offset = endOffset;
    }

    return segments;
  }

  // ---------------------------------------------------------------------------
  // Inline image detection
  // ---------------------------------------------------------------------------

  private static isInlineImageStart(bytes: Uint8Array, offset: number): boolean {
    let i = offset;

    // Skip whitespace
    while (i < bytes.length && this.isWhitespace(bytes[i])) i++;

    // Expect 'B' 'I'
    if (i + 1 >= bytes.length) return false;
    if (bytes[i] !== 0x42 /* B */ || bytes[i + 1] !== 0x49 /* I */) {
      return false;
    }

    const after = i + 2;
    if (after >= bytes.length) return true;

    // Must be followed by whitespace or delimiter
    return this.isDelimiterOrWhitespace(bytes[after]);
  }

  private static extractInlineImage(
    bytes: Uint8Array,
    offset: number
  ): { endOffset: number; segment: Uint8Array } {

    const start = offset;
    let i = offset;
    let sawBI = false;

    // Find BI
    while (i < bytes.length) {
      if (!sawBI && this.isInlineImageStart(bytes, i)) {
        sawBI = true;
        i = this.skipKeyword(bytes, i, 'BI');
        continue;
      }

      // Find ID
      if (sawBI && this.matchesKeyword(bytes, i, 'ID')) {
        i = this.skipKeyword(bytes, i, 'ID');
        break;
      }

      i++;
    }

    const imageDataStart = i;

    // Find EI
    while (i < bytes.length) {
      if (this.matchesKeyword(bytes, i, 'EI') &&
          this.isOperatorBoundary(bytes, i, 'EI')) {

        const end = this.skipKeyword(bytes, i, 'EI');
        return {
          endOffset: end,
          segment: bytes.subarray(start, end)
        };
      }
      i++;
    }

    // If EI not found, treat rest as binary
    return {
      endOffset: bytes.length,
      segment: bytes.subarray(start)
    };
  }

  // ---------------------------------------------------------------------------
  // Operator region extraction
  // ---------------------------------------------------------------------------

  private static extractOperatorRegion(
    bytes: Uint8Array,
    offset: number
  ): { endOffset: number; segment: Uint8Array } {

    const start = offset;
    let i = offset;

    while (i < bytes.length) {
      if (this.isInlineImageStart(bytes, i)) break;
      i++;
    }

    return {
      endOffset: i,
      segment: bytes.subarray(start, i)
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private static isWhitespace(byte: number): boolean {
    return (
      byte === 0x00 ||
      byte === 0x09 ||
      byte === 0x0A ||
      byte === 0x0C ||
      byte === 0x0D ||
      byte === 0x20
    );
  }

  private static isDelimiterOrWhitespace(byte: number): boolean {
    if (this.isWhitespace(byte)) return true;
    switch (byte) {
      case 0x28: // (
      case 0x29: // )
      case 0x3C: // <
      case 0x3E: // >
      case 0x5B: // [
      case 0x5D: // ]
      case 0x7B: // {
      case 0x7D: // }
      case 0x2F: // /
      case 0x25: // %
        return true;
      default:
        return false;
    }
  }

  private static matchesKeyword(bytes: Uint8Array, offset: number, keyword: string): boolean {
    if (offset + keyword.length > bytes.length) return false;
    for (let i = 0; i < keyword.length; i++) {
      if (bytes[offset + i] !== keyword.charCodeAt(i)) return false;
    }
    return true;
  }

  private static skipKeyword(bytes: Uint8Array, offset: number, keyword: string): number {
    let i = offset;

    // Skip whitespace
    while (i < bytes.length && this.isWhitespace(bytes[i])) i++;

    // Skip keyword
    for (let k = 0; k < keyword.length && i < bytes.length; k++, i++);

    return i;
  }

  private static isOperatorBoundary(bytes: Uint8Array, offset: number, keyword: string): boolean {
    // Check before
    let before = offset - 1;
    while (before >= 0 && this.isWhitespace(bytes[before])) before--;
    if (before >= 0 && !this.isDelimiterOrWhitespace(bytes[before])) return false;

    // Check after
    let after = offset + keyword.length;
    while (after < bytes.length && this.isWhitespace(bytes[after])) after++;
    if (after >= bytes.length) return true;

    return this.isDelimiterOrWhitespace(bytes[after]);
  }
}
