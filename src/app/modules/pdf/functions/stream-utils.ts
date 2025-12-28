import { PDFDict, PDFRef, PDFArray, PDFName, PDFContext, PDFStream } from 'pdf-lib';

export function getAllPageRefs(
  rootPagesDict: PDFDict,
  ctx: PDFContext,
): PDFRef[] {
  const results: PDFRef[] = [];

  function walk(node: PDFDict) {
    const kids = node.get(PDFName.of('Kids')) as PDFArray;
    if (!kids) return;

    for (let i = 0; i < kids.size(); i++) {
      const ref = kids.get(i);

      if (!(ref instanceof PDFRef)) continue;

      const child = ctx.lookup(ref) as PDFDict;
      const type = child.get(PDFName.of('Type'));

      if (type === PDFName.of('Page')) {
        // leaf node
        results.push(ref);
      } else if (type === PDFName.of('Pages')) {
        // recurse into subtree
        walk(child);
      }
    }
  }

  walk(rootPagesDict);
  return results;
}



export function getContentRefs(pageDict: PDFDict): PDFRef[] {
  const contents = pageDict.get(PDFName.of('Contents'));

  if (!contents) return [];

  // Case 1: /Contents is a single reference
  if (contents instanceof PDFRef) {
    return [contents];
  }

  // Case 2: /Contents is an array of references
  if (contents instanceof PDFArray) {
    const refs: PDFRef[] = [];
    for (let i = 0; i < contents.size(); i++) {
      const item = contents.get(i);
      if (item instanceof PDFRef) {
        refs.push(item);
      }
    }
    return refs;
  }

  // Case 3: /Contents is a direct stream (rare but valid)
  if (contents instanceof PDFStream) {
    // Direct streams have no ref, but you can wrap them if needed
    return [];
  }

  return [];
}

// export async function decodeStream(stream: PDFStream): Promise<Uint8Array> {

//   // If the stream is not encoded, return raw contents
//   if (!isEncodedStream(stream)) {
//     const raw = stream.getContents();
//     return raw;
//   }

//   // Encoded stream: handle FlateDecode (for now)
//   if (hasFilter(stream, 'FlateDecode')) {
//     const inflated = await inflate(stream.getContents());
//     return inflated;
//   }

//   // Encoded but not FlateDecode — return raw bytes
//   const raw = stream.getContents();
//   return raw;
// }


// export async function inflate(data: Uint8Array): Promise<Uint8Array> {
//   // Ensure the buffer is a real ArrayBuffer
//   const safe = new Uint8Array(data);

//   const ds = new DecompressionStream('deflate');
//   const writer = ds.writable.getWriter();
//   writer.write(safe);
//   writer.close();

//   const output = await new Response(ds.readable).arrayBuffer();
//   return new Uint8Array(output);
// }

// export async function deflate(data: Uint8Array): Promise<Uint8Array> {
//   // Ensure the buffer is a real ArrayBuffer
//   const safe = new Uint8Array(data);

//   const cs = new CompressionStream('deflate');
//   const writer = cs.writable.getWriter();
//   writer.write(safe);
//   writer.close();

//   const output = await new Response(cs.readable).arrayBuffer();
//   return new Uint8Array(output);
// }

// export function getStreamFilters(stream: PDFStream): PDFName[] {

//   const filter = stream.dict.get(PDFName.of('Filter'));

//   // No filter → return empty array
//   if (!filter) {
//     return [];
//   }

//   // Single filter → wrap in array
//   if (filter instanceof PDFName) {
//     return [filter];
//   }

//   // Array of filters → normalize to PDFName[]
//   if (filter instanceof PDFArray) {
//     return filter.asArray().filter(f => f instanceof PDFName) as PDFName[];
//   }

//   // Unexpected shape → treat as no filters
//   return [];
// }

// export function hasFilter(stream: PDFStream, name: string): boolean {
//   const filters = getStreamFilters(stream);

//   // Compare by decoded PDFName text
//   return filters.some(f => f.decodeText() === name);
// }

// export function isEncodedStream(stream: PDFStream): boolean {

//   const filter = stream.dict.get(PDFName.of('Filter'));
//   return !!filter
// }

// export function isCompressedStream(stream: PDFStream): boolean {

//   const filter = stream.dict.get(PDFName.of('Filter'));

//   // No filter → uncompressed
//   if (!filter) {
//     return false;
//   }

//   // Single filter name → compressed
//   if (filter instanceof PDFName) {
//     return true;
//   }

//   // Array of filters → compressed if non‑empty
//   if (filter instanceof PDFArray) {
//     return filter.asArray().length > 0;
//   }

//   // Any unexpected shape → treat as uncompressed
//   return false;
// }

// export function streamToString(bytes: Uint8Array): string {
//   return new TextDecoder('latin1').decode(bytes);
// }

