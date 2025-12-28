// import { ContentStreamTokenizer } from './../../services/content-stream-tokenizer';
import { PDFOperator } from '../../model/pdf-operator';
import { PDFToken } from '../../model/pdf-token';
import {
  ContentStreamSegment,
  ContentStreamTokenizer,
} from '../../services/content-stream-tokenizer';
import {
  concatUint8Arrays,
  extractLogicalTextBlocks,
  insertMCIDsIntoBlock,
  parseOperators,
  serializeOperators,
  tokenizeContentStream,
} from '../token-utils';
import { MCIDCounter } from './mcid-counter';
import {
  StreamBiTransformer,
  StreamTransformer,
  WrappedStream,
} from './stream-transformer.type';

// export const McidInsertStreamTransformer: StreamBiTransformer<number, Uint8Array> = async (input: Uint8Array, startMCID: number):
//   Promise<Uint8Array> => {

//   let runningMCID = startMCID;
//   // for each MCID we insert, we just increment the MCID number

//   const tokenizer = new ContentStreamTokenizer();
//   let segments: ContentStreamSegment[] = ContentStreamTokenizer.segment(input);

//   // we have the segments, now we have to process the MCIDs
//   for (const seg of segments) {

//   }

//   const result: WrappedStream = {
//     stream: input,
//     dict: { lastMCID: runningMCID}
//   };

//   return result;
// }

// function createMCIDCounter(start = 0) {
//   let mcid = start;
//   return () => mcid++;
// }

// const nextMCID = createMCIDCounter(startMCID);

export const mcidInsertStreamTransformer: StreamBiTransformer<
  number,
  Uint8Array
> = async (input: Uint8Array, startMCID: number): Promise<Uint8Array> => {
  //let runningMCID = startMCID;

  // Segment the raw bytes into operator vs binary regions
  const segments: ContentStreamSegment[] =
    ContentStreamTokenizer.segment(input);
  const rewrittenSegments: Uint8Array[] = [];

  for (const seg of segments) {
    if (seg.type === 'binary') {
      // Inline images / unknown binary: preserve as-is
      rewrittenSegments.push(seg.bytes);
      continue;
    }

    // Tokenize, parse, and extract logical blocks
    const tokens = tokenizeContentStream(seg.bytes);
    const ops = parseOperators(tokens);
    const blocks = extractLogicalTextBlocks(ops);

    const rewrittenOps: PDFOperator[] = [];

    for (const block of blocks) {
      const { operators: tagged, nextMCID } = insertMCIDsIntoBlock(
        block.operators,
        startMCID
      );

      rewrittenOps.push(...tagged);
      startMCID = nextMCID;
    }

    // Serialize back to text and re-encode to bytes
    const rewrittenText = serializeOperators(rewrittenOps);
    const rewrittenBytes = new TextEncoder().encode(rewrittenText);
    rewrittenSegments.push(rewrittenBytes);
  }

  const finalStream = concatUint8Arrays(rewrittenSegments);

  return finalStream;

};

export const createMcidStreamTransformer = (counter: MCIDCounter):  StreamTransformer => {

  return async (input: Uint8Array): Promise<Uint8Array> => {

    const segments: ContentStreamSegment[] =
      ContentStreamTokenizer.segment(input);
    const rewrittenSegments: Uint8Array[] = [];

    for (const seg of segments) {
      if (seg.type === 'binary') {
        // Inline images / unknown binary: preserve as-is
        rewrittenSegments.push(seg.bytes);
        continue;
      }

      // Tokenize, parse, and extract logical blocks
      const tokens = tokenizeContentStream(seg.bytes);
      const ops = parseOperators(tokens);
      const blocks = extractLogicalTextBlocks(ops);

      const rewrittenOps: PDFOperator[] = [];

      for (const block of blocks) {
        const { operators: tagged, nextMCID } = insertMCIDsIntoBlock(
          block.operators,
          counter.current()
        );

        rewrittenOps.push(...tagged);
        counter.reset(nextMCID);
      }

      // Serialize back to text and re-encode to bytes
      const rewrittenText = serializeOperators(rewrittenOps);
      const rewrittenBytes = new TextEncoder().encode(rewrittenText);
      rewrittenSegments.push(rewrittenBytes);
    }

    const finalStream = concatUint8Arrays(rewrittenSegments);

    return finalStream;
  }
}

// export function mcidTransformerFactory(
//   startMCID: number,
//   onMCID: (next: number) => void
// ): StreamTransformer {

//   return async (input: Uint8Array): Promise<Uint8Array> => {
//     const { stream, dict } =
//       await McidInsertStreamTransformer(input, startMCID);

//     onMCID(dict['lastMCID']);
//     return stream;
//   };
// }

// export function mcidTransformerFactory(
//   startMCID: number,
//   onMCID: (next: number) => void
// ): StreamTransformer {
//   return async (input: Uint8Array): Promise<Uint8Array> => {
//     const { stream, dict } =
//       await mcidInsertStreamTransformer(input, startMCID);

//     onMCID(dict['lastMCID'] as number);
//     return stream; // <-- MUST return Uint8Array
//   };
// }
