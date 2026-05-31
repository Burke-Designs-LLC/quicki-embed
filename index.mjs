const DEFAULT_DIM = 1024;
const DEFAULT_MODE = "static";
const INITIAL_SINGLE_INPUT_CAP = 4096;
const WARMUP_TEXT = "quicki embed warmup for low latency vector search on the edge";
const WARMUP_RUNS = 8;
const _defaultInstances = new Map();

// Each mode ships its own purpose-built wasm so a caller only downloads what it
// uses: static (semantic table only, the default) ~32 MB, hybrid (lexical +
// semantic) ~32 MB, hashing (lexical only) ~50 KB.
const WASM_FILES = {
  static: "./quicki-embed.wasm",
  hybrid: "./quicki-embed-hybrid.wasm",
  hashing: "./quicki-embed-hashing.wasm",
};

function wasmFileForMode(mode) {
  const file = WASM_FILES[mode];
  if (!file) throw new Error(`unknown mode ${String(mode)}`);
  return file;
}

function isAscii(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function instanceKey(dim, mode, source) {
  return `${mode}:${dim}:${source ? String(source) : "default"}`;
}

export class QuickiEmbed {
  constructor(instance, options = {}) {
    const { dim = DEFAULT_DIM, mode = DEFAULT_MODE } = options;
    this.ex = instance.exports;
    this.mode = mode;
    this.lexDim = dim;
    this.semanticDim = typeof this.ex.semantic_dim === "function" ? Number(this.ex.semantic_dim()) : 0;
    this.semanticVocab = typeof this.ex.semantic_vocab === "function" ? Number(this.ex.semantic_vocab()) : 0;
    if (mode === "hybrid") {
      this.dim = this.lexDim + this.semanticDim;
    } else if (mode === "static") {
      // `dim` truncates the semantic vector (Matryoshka): the table dims are
      // variance-ordered, so the first N carry the most signal. Clamped to
      // 1..=semanticDim; the default lexDim (1024) yields the full 512.
      this.dim = Math.max(1, Math.min(this.lexDim, this.semanticDim));
    } else {
      this.dim = this.lexDim;
    }
    this.enc = new TextEncoder();
    this.idfPtr = 0;
    this.idfCap = 0;
    this.tokenIdfPtr = 0;
    this.tokenIdfCap = 0;
    if (typeof this.ex.init_static === "function") {
      this.ex.init_static();
    }
    this.singleInPtr = this.ex.alloc(INITIAL_SINGLE_INPUT_CAP);
    this.singleInCap = INITIAL_SINGLE_INPUT_CAP;
    this.singleOutPtr = this.ex.alloc(this.dim * 4);
    this.batchTextPtr = 0;
    this.batchTextCap = 0;
    this.batchLensPtr = 0;
    this.batchLensCap = 0;
    this.batchOutPtr = 0;
    this.batchOutCap = 0;
    this.closed = false;
    for (let i = 0; i < WARMUP_RUNS; i++) {
      this.embed(WARMUP_TEXT);
    }
  }

  static async fromBytes(bytes, dim = DEFAULT_DIM, mode = DEFAULT_MODE) {
    let source;
    if (bytes instanceof ArrayBuffer) {
      source = bytes;
    } else if (ArrayBuffer.isView(bytes)) {
      source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else {
      const resolved = await bytes;
      source = resolved instanceof ArrayBuffer ? resolved : await resolved.arrayBuffer();
    }
    const { instance } = await WebAssembly.instantiate(source, {});
    return new QuickiEmbed(instance, { dim, mode });
  }

  static async fromURL(url, dim = DEFAULT_DIM, mode = DEFAULT_MODE) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load wasm from ${String(url)}: ${response.status}`);
    }
    return QuickiEmbed.fromBytes(await response.arrayBuffer(), dim, mode);
  }

  static async fromFile(pathOrUrl, dim = DEFAULT_DIM, mode = DEFAULT_MODE) {
    const { readFileSync } = await import("node:fs");
    const data = readFileSync(pathOrUrl);
    return QuickiEmbed.fromBytes(data, dim, mode);
  }

  static async create(options = {}) {
    const { dim = DEFAULT_DIM, mode = DEFAULT_MODE, source } = options;
    if (source) {
      if (typeof source === "string" || source instanceof URL) {
        const url = source instanceof URL ? source : new URL(source, import.meta.url);
        if (url.protocol === "file:") return QuickiEmbed.fromFile(url, dim, mode);
        return QuickiEmbed.fromURL(url, dim, mode);
      }
      return QuickiEmbed.fromBytes(source, dim, mode);
    }
    const url = new URL(wasmFileForMode(mode), import.meta.url);
    if (url.protocol === "file:") return QuickiEmbed.fromFile(url, dim, mode);
    return QuickiEmbed.fromURL(url, dim, mode);
  }

  ensureOpen() {
    if (this.closed) {
      throw new Error("QuickiEmbed instance is closed");
    }
  }

  ensureBuffer(kind, size) {
    const ptrKey = `${kind}Ptr`;
    const capKey = `${kind}Cap`;
    if (this[capKey] >= size && this[ptrKey]) return this[ptrKey];
    if (this[ptrKey]) this.ex.dealloc(this[ptrKey], this[capKey]);
    this[ptrKey] = this.ex.alloc(size || 1);
    this[capKey] = size || 1;
    return this[ptrKey];
  }

  ensureLexIdfBuffer() {
    return this.ensureBuffer("idf", this.lexDim * 4);
  }

  ensureTokenIdfBuffer() {
    if (!this.semanticVocab) {
      throw new Error("This wasm build does not expose semantic token weights");
    }
    return this.ensureBuffer("tokenIdf", this.semanticVocab * 4);
  }

  setIdf(idf) {
    this.ensureOpen();
    if (this.mode === "static") {
      throw new Error("static mode has no lexical IDF; use setTokenIdf() for semantic weights");
    }
    if (idf.length !== this.lexDim) throw new Error("idf length != lexical dim");
    const ptr = this.ensureLexIdfBuffer();
    new Float32Array(this.ex.memory.buffer, ptr, this.lexDim).set(idf);
    this.idfPtr = ptr;
    return this;
  }

  clearIdf() {
    this.ensureOpen();
    if (this.idfPtr) this.ex.dealloc(this.idfPtr, this.idfCap);
    this.idfPtr = 0;
    this.idfCap = 0;
    return this;
  }

  setTokenIdf(idf) {
    this.ensureOpen();
    if (idf.length !== this.semanticVocab) {
      throw new Error("token idf length != semantic vocab");
    }
    const ptr = this.ensureTokenIdfBuffer();
    new Float32Array(this.ex.memory.buffer, ptr, this.semanticVocab).set(idf);
    this.tokenIdfPtr = ptr;
    return this;
  }

  clearTokenIdf() {
    this.ensureOpen();
    if (this.tokenIdfPtr) this.ex.dealloc(this.tokenIdfPtr, this.tokenIdfCap);
    this.tokenIdfPtr = 0;
    this.tokenIdfCap = 0;
    return this;
  }

  // Dispatch a single encoded text to the right wasm export for this mode.
  encodeOne(inPtr, len, outPtr) {
    const ex = this.ex;
    if (this.mode === "hybrid") {
      ex.encode_hybrid(inPtr, len, this.lexDim, this.idfPtr, this.tokenIdfPtr, outPtr);
    } else if (this.mode === "static") {
      ex.encode_static(inPtr, len, this.dim, this.tokenIdfPtr, outPtr);
    } else {
      ex.encode(inPtr, len, this.lexDim, this.idfPtr, outPtr);
    }
  }

  // Dispatch a packed batch to the right wasm export for this mode.
  encodeMany(textPtr, lensPtr, n, outPtr) {
    const ex = this.ex;
    if (this.mode === "hybrid") {
      ex.encode_batch_hybrid(textPtr, lensPtr, n, this.lexDim, this.idfPtr, this.tokenIdfPtr, outPtr);
    } else if (this.mode === "static") {
      ex.encode_batch_static(textPtr, lensPtr, n, this.dim, this.tokenIdfPtr, outPtr);
    } else {
      ex.encode_batch(textPtr, lensPtr, n, this.lexDim, this.idfPtr, outPtr);
    }
  }

  embed(text) {
    this.ensureOpen();
    const ex = this.ex;
    let len = 0;
    if (isAscii(text)) {
      len = text.length;
      const inPtr = this.ensureBuffer("singleIn", len);
      const mem = new Uint8Array(ex.memory.buffer, inPtr, len);
      for (let i = 0; i < len; i++) mem[i] = text.charCodeAt(i);
      this.encodeOne(inPtr, len, this.singleOutPtr);
    } else {
      const u8 = this.enc.encode(text);
      len = u8.length;
      const inPtr = this.ensureBuffer("singleIn", len);
      new Uint8Array(ex.memory.buffer, inPtr, len).set(u8);
      this.encodeOne(inPtr, len, this.singleOutPtr);
    }
    return new Float32Array(ex.memory.buffer, this.singleOutPtr, this.dim).slice();
  }

  embedBatch(texts) {
    this.ensureOpen();
    const ex = this.ex;
    const n = texts.length;
    const lensPtr = this.ensureBuffer("batchLens", n * 4);
    const outPtr = this.ensureBuffer("batchOut", n * this.dim * 4);

    if (texts.every(isAscii)) {
      let total = 0;
      for (let i = 0; i < n; i++) total += texts[i].length;
      const textPtr = this.ensureBuffer("batchText", total);
      const lens = new Uint32Array(ex.memory.buffer, lensPtr, n);
      const mem = new Uint8Array(ex.memory.buffer, textPtr, total);
      let off = 0;
      for (let i = 0; i < n; i++) {
        const text = texts[i];
        const len = text.length;
        lens[i] = len;
        for (let j = 0; j < len; j++) mem[off + j] = text.charCodeAt(j);
        off += len;
      }
      this.encodeMany(textPtr, lensPtr, n, outPtr);
    } else {
      const encoded = texts.map((t) => this.enc.encode(t));
      const total = encoded.reduce((a, b) => a + b.length, 0);
      const textPtr = this.ensureBuffer("batchText", total);
      const lens = new Uint32Array(ex.memory.buffer, lensPtr, n);
      const mem = new Uint8Array(ex.memory.buffer);
      let off = 0;
      for (let i = 0; i < n; i++) {
        mem.set(encoded[i], textPtr + off);
        lens[i] = encoded[i].length;
        off += encoded[i].length;
      }
      this.encodeMany(textPtr, lensPtr, n, outPtr);
    }
    return new Float32Array(ex.memory.buffer, outPtr, n * this.dim).slice();
  }

  fitIdf(texts) {
    this.ensureOpen();
    if (this.mode === "static") {
      throw new Error("static mode has no lexical IDF; use fitRetrieval() to fit token weights");
    }
    const n = texts.length;
    const lensPtr = this.ensureBuffer("batchLens", n * 4);
    const textPtr = this.ensureEncodedTexts(texts, lensPtr);
    const lexPtr = this.ensureLexIdfBuffer();
    this.ex.fit_lex_idf(textPtr, lensPtr, n, this.lexDim, lexPtr);
    this.idfPtr = lexPtr;
    return this;
  }

  fitRetrieval(texts) {
    this.ensureOpen();
    const n = texts.length;
    const lensPtr = this.ensureBuffer("batchLens", n * 4);
    const textPtr = this.ensureEncodedTexts(texts, lensPtr);
    if (this.mode === "static") {
      const tokPtr = this.ensureTokenIdfBuffer();
      this.ex.fit_static_idf(textPtr, lensPtr, n, tokPtr);
      this.tokenIdfPtr = tokPtr;
    } else if (this.mode === "hybrid") {
      const lexPtr = this.ensureLexIdfBuffer();
      const tokPtr = this.ensureTokenIdfBuffer();
      this.ex.fit_retrieval_idf(textPtr, lensPtr, n, this.lexDim, lexPtr, tokPtr);
      this.idfPtr = lexPtr;
      this.tokenIdfPtr = tokPtr;
    } else {
      const lexPtr = this.ensureLexIdfBuffer();
      this.ex.fit_lex_idf(textPtr, lensPtr, n, this.lexDim, lexPtr);
      this.idfPtr = lexPtr;
    }
    return this;
  }

  ensureEncodedTexts(texts, lensPtr) {
    const ex = this.ex;
    const n = texts.length;
    if (texts.every(isAscii)) {
      let total = 0;
      for (let i = 0; i < n; i++) total += texts[i].length;
      const textPtr = this.ensureBuffer("batchText", total);
      const lens = new Uint32Array(ex.memory.buffer, lensPtr, n);
      const mem = new Uint8Array(ex.memory.buffer, textPtr, total);
      let off = 0;
      for (let i = 0; i < n; i++) {
        const text = texts[i];
        const len = text.length;
        lens[i] = len;
        for (let j = 0; j < len; j++) mem[off + j] = text.charCodeAt(j);
        off += len;
      }
      return textPtr;
    }
    const encoded = texts.map((t) => this.enc.encode(t));
    const total = encoded.reduce((a, b) => a + b.length, 0);
    const textPtr = this.ensureBuffer("batchText", total);
    const lens = new Uint32Array(ex.memory.buffer, lensPtr, n);
    const mem = new Uint8Array(ex.memory.buffer);
    let off = 0;
    for (let i = 0; i < n; i++) {
      mem.set(encoded[i], textPtr + off);
      lens[i] = encoded[i].length;
      off += encoded[i].length;
    }
    return textPtr;
  }

  close() {
    if (this.closed) return;
    if (this.idfPtr) this.ex.dealloc(this.idfPtr, this.idfCap);
    if (this.tokenIdfPtr) this.ex.dealloc(this.tokenIdfPtr, this.tokenIdfCap);
    if (this.singleInPtr) this.ex.dealloc(this.singleInPtr, this.singleInCap);
    if (this.singleOutPtr) this.ex.dealloc(this.singleOutPtr, this.dim * 4);
    if (this.batchTextPtr) this.ex.dealloc(this.batchTextPtr, this.batchTextCap);
    if (this.batchLensPtr) this.ex.dealloc(this.batchLensPtr, this.batchLensCap);
    if (this.batchOutPtr) this.ex.dealloc(this.batchOutPtr, this.batchOutCap);
    this.idfPtr = 0;
    this.idfCap = 0;
    this.tokenIdfPtr = 0;
    this.tokenIdfCap = 0;
    this.singleInPtr = 0;
    this.singleInCap = 0;
    this.singleOutPtr = 0;
    this.batchTextPtr = 0;
    this.batchTextCap = 0;
    this.batchLensPtr = 0;
    this.batchLensCap = 0;
    this.batchOutPtr = 0;
    this.batchOutCap = 0;
    this.closed = true;
  }
}

export const FastEmbed = QuickiEmbed;

export async function createQuickiEmbed(options = {}) {
  return QuickiEmbed.create(options);
}

export async function createFastEmbed(options = {}) {
  return createQuickiEmbed(options);
}

export async function getQuickiEmbed(options = {}) {
  const { dim = DEFAULT_DIM, mode = DEFAULT_MODE, source } = options;
  const key = instanceKey(dim, mode, source);
  if (_defaultInstances.has(key)) {
    const existing = await _defaultInstances.get(key);
    if (!existing.closed) return existing;
    _defaultInstances.delete(key);
  }
  const created = QuickiEmbed.create({ dim, mode, source });
  _defaultInstances.set(key, created);
  return created;
}

export async function getFastEmbed(options = {}) {
  return getQuickiEmbed(options);
}

export async function embed(text, options = {}) {
  const instance = await getQuickiEmbed(options);
  return instance.embed(text);
}

export async function embedBatch(texts, options = {}) {
  const instance = await getQuickiEmbed(options);
  return instance.embedBatch(texts);
}

export default QuickiEmbed;
