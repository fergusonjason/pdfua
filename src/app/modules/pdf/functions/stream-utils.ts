import { PDFArray, PDFDict, PDFName, PDFOperator, PDFPage, PDFStream } from "pdf-lib";
import { PDFToken } from "../model/pdf-token";

export async function decodeStream(stream: PDFStream): Promise<Uint8Array> {

  // If the stream is not encoded, return raw contents
  if (!isEncodedStream(stream)) {
    const raw = stream.getContents();
    return raw;
  }

  // Encoded stream: handle FlateDecode (for now)
  if (hasFilter(stream, 'FlateDecode')) {
    const inflated = await inflate(stream.getContents());
    return inflated;
  }

  // Encoded but not FlateDecode — return raw bytes
  const raw = stream.getContents();
  return raw;
}


export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // Ensure the buffer is a real ArrayBuffer
  const safe = new Uint8Array(data);

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(safe);
  writer.close();

  const output = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(output);
}

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // Ensure the buffer is a real ArrayBuffer
  const safe = new Uint8Array(data);

  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(safe);
  writer.close();

  const output = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(output);
}

export function getStreamFilters(stream: PDFStream): PDFName[] {

  const filter = stream.dict.get(PDFName.of('Filter'));

  // No filter → return empty array
  if (!filter) {
    return [];
  }

  // Single filter → wrap in array
  if (filter instanceof PDFName) {
    return [filter];
  }

  // Array of filters → normalize to PDFName[]
  if (filter instanceof PDFArray) {
    return filter.asArray().filter(f => f instanceof PDFName) as PDFName[];
  }

  // Unexpected shape → treat as no filters
  return [];
}

export function hasFilter(stream: PDFStream, name: string): boolean {
  const filters = getStreamFilters(stream);

  // Compare by decoded PDFName text
  return filters.some(f => f.decodeText() === name);
}

export function isEncodedStream(stream: PDFStream): boolean {

  const filter = stream.dict.get(PDFName.of('Filter'));
  return !!filter
}

export function isCompressedStream(stream: PDFStream): boolean {

  const filter = stream.dict.get(PDFName.of('Filter'));

  // No filter → uncompressed
  if (!filter) {
    return false;
  }

  // Single filter name → compressed
  if (filter instanceof PDFName) {
    return true;
  }

  // Array of filters → compressed if non‑empty
  if (filter instanceof PDFArray) {
    return filter.asArray().length > 0;
  }

  // Any unexpected shape → treat as uncompressed
  return false;
}

export function streamToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

// export const getPageContentStreams = (page: PDFPage): PDFStream[] => {

//   const pageDict = page.node.dict;
//   const contents = pageDict.get(PDFName.of('Contents'));

//   if (contents instanceof PDFStream) {
//     return [contents];
//   }

//   if (contents instanceof PDFArray) {
//     return contents.asArray().filter(c => c instanceof PDFStream) as PDFStream[];
//   }

//   return [];
// }



