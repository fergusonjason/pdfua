import { inflate } from "../stream-utils";
import { StreamTransformer } from "./stream-transformer.type";

export const inflateStream: StreamTransformer = async (input: Uint8Array): Promise<Uint8Array> => {
  const inflated = await inflate(input);
  return inflated;
}
