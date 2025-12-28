
export type StreamTransformer = (input: Uint8Array) => Promise<Uint8Array | WrappedStream>;

export type StreamBiTransformer<S=any, T=any> = (input: Uint8Array, arg: S  ) => Promise<T>;

export interface WrappedStream {
    stream: Uint8Array;
    dict: Record<string, any>;
}