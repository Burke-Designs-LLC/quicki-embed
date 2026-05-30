/**
 * Embedding backend. Each maps to its own wasm artifact, downloaded on demand:
 *  - "static"  (default): semantic model2vec table only, ~32 MB. Output is 512
 *      dims by default; pass `dim` (1..=512) to truncate (Matryoshka — the table
 *      dims are variance-ordered, so the first N carry the most signal).
 *  - "hybrid":  lexical hashing + semantic table fused, ~32 MB, `dim` = lexDim + 512.
 *  - "hashing": lexical hashing only, ~50 KB, `dim` = lexDim.
 */
export type QuickiEmbedMode = "static" | "hybrid" | "hashing";
export type FastEmbedMode = QuickiEmbedMode;

export interface QuickiEmbedSourceOptions {
  dim?: number;
  mode?: QuickiEmbedMode;
  source?:
    | string
    | URL
    | ArrayBuffer
    | Uint8Array
    | Response
    | Promise<Response>;
}
export type FastEmbedSourceOptions = QuickiEmbedSourceOptions;

export class QuickiEmbed {
  readonly mode: QuickiEmbedMode;
  readonly lexDim: number;
  readonly semanticDim: number;
  readonly semanticVocab: number;
  readonly dim: number;

  constructor(instance: WebAssembly.Instance, options?: {
    dim?: number;
    mode?: QuickiEmbedMode;
  });

  static fromBytes(
    bytes: ArrayBuffer | Uint8Array | Response | Promise<Response>,
    dim?: number,
    mode?: QuickiEmbedMode,
  ): Promise<QuickiEmbed>;

  static fromURL(url: string | URL, dim?: number, mode?: QuickiEmbedMode): Promise<QuickiEmbed>;

  static fromFile(pathOrUrl: string | URL, dim?: number, mode?: QuickiEmbedMode): Promise<QuickiEmbed>;

  static create(options?: QuickiEmbedSourceOptions): Promise<QuickiEmbed>;

  setIdf(idf: Float32Array | number[]): this;

  clearIdf(): this;

  setTokenIdf(idf: Float32Array | number[]): this;

  clearTokenIdf(): this;

  fitIdf(texts: string[]): this;

  fitRetrieval(texts: string[]): this;

  embed(text: string): Float32Array;

  embedBatch(texts: string[]): Float32Array;

  close(): void;
}
export { QuickiEmbed as FastEmbed };

export function createQuickiEmbed(options?: QuickiEmbedSourceOptions): Promise<QuickiEmbed>;
export function createFastEmbed(options?: QuickiEmbedSourceOptions): Promise<QuickiEmbed>;

export function getQuickiEmbed(options?: {
  dim?: number;
  mode?: QuickiEmbedMode;
  source?: string | URL;
}): Promise<QuickiEmbed>;
export function getFastEmbed(options?: {
  dim?: number;
  mode?: QuickiEmbedMode;
  source?: string | URL;
}): Promise<QuickiEmbed>;

export function embed(
  text: string,
  options?: {
    dim?: number;
    mode?: QuickiEmbedMode;
    source?: string | URL;
  },
): Promise<Float32Array>;

export function embedBatch(
  texts: string[],
  options?: {
    dim?: number;
    mode?: QuickiEmbedMode;
    source?: string | URL;
  },
): Promise<Float32Array>;

export default QuickiEmbed;
