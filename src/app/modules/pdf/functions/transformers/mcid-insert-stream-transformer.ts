import { PDFOperator } from '../../model/pdf-operator';
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
  StreamTransformer
} from './stream-transformer.type';

// This needs to be a factory function so that we can maintain running MCIDs

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

