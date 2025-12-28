import { deflate } from "../stream-utils";
import { StreamTransformer } from "./stream-transformer.type";

export const deflateStream: StreamTransformer = async (input: Uint8Array): Promise<Uint8Array> => {
  const deflated = await deflate(input);
  return deflated;
}
