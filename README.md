# QuickiEmbed

**The fastest text embedding model. Period.**

QuickiEmbed is a retrieval-tuned embedding runtime for browsers, Node.js, Bun, Deno, and edge runtimes.

- **Up to `1,065,442 texts/sec` in batch**
- **Up to `2,129,815 texts/sec` on tiny inputs**
- **Beats BM25 on BEIR-6 average in the default mode**
- **Ships in modes from `~32 MB` down to `~50 KB`**

![Embedding throughput](https://raw.githubusercontent.com/Burke-Designs-LLC/quicki-embed/main/dist/readme-speed-chart.svg)

## Why Use It

- fast enough to disappear into the product
- built for retrieval, not just demos
- runs in modern JavaScript runtimes
- outputs unit-normalized `Float32Array` vectors ready for cosine similarity and vector search

## Quick Start

```js
import { embed } from "quicki-embed";

const vector = await embed("retrieval on the edge");
console.log(vector.length); // 512
```

Reuse an instance:

```js
import QuickiEmbed from "quicki-embed";

const qe = await QuickiEmbed.create();
const vector = qe.embed("best budget headphones");
const batch = qe.embedBatch([
  "portable bluetooth speaker",
  "studio headphones with clean mids",
  "active noise cancelling earbuds",
]);
qe.close();
```

Fit retrieval weights once for your corpus:

```js
import QuickiEmbed from "quicki-embed";

const docs = [
  "the cat sat on the mat",
  "stock markets fell today",
  "retrieval on the edge",
];

const qe = await QuickiEmbed.create();
qe.fitRetrieval(docs);

const docVectors = qe.embedBatch(docs);
const queryVector = qe.embed("cat on a mat");
```

Rerank a small first-stage candidate set with token-level late interaction:

```js
const { indices, scores } = qe.rerank("cat on a mat", docs, { topK: 3 });
```

Use fewer late-interaction dimensions for faster reranking:

```js
const fast = qe.rerank("cat on a mat", docs, { topK: 3, dim: 384 });
```

If you already have first-stage cosine scores for the same candidates, you can
blend them in so late interaction refines the original rank instead of replacing it:

```js
const reranked = qe.rerank("cat on a mat", docs, {
  topK: 3,
  baseScores,
  baseWeight: 2,
});
```

## Modes

- `static`: best default, `512` dims, strongest speed/quality balance
- `hybrid`: best retrieval quality in the package
- `hashing`: tiny `~50 KB` build

```js
import QuickiEmbed from "quicki-embed";

const a = await QuickiEmbed.create();
const b = await QuickiEmbed.create({ mode: "hybrid" });
const c = await QuickiEmbed.create({ mode: "hashing", dim: 1024 });
```

## Performance

Measured on Apple Silicon:

| mode | output dim | single-call | batch |
|---|---:|---:|---:|
| `static` (default) | `512` | `1,005,871 texts/sec` | `1,065,442 texts/sec` |
| `hybrid` | `1536` | `417,522 texts/sec` | `452,058 texts/sec` |
| `hashing` | `1024` | `748,989 texts/sec` | `961,863 texts/sec` |

First real `embed()` call after `QuickiEmbed.create()` / `fromFile()` resolves:

| mode | median latency | p95 latency |
|---|---:|---:|
| `static` (default) | `0.0075 ms` | `0.0189 ms` |
| `hybrid` | `0.0089 ms` | `0.0138 ms` |
| `hashing` | `0.0019 ms` | `0.0270 ms` |

Representative single-call throughput by input size:

| text shape | approx chars | `static` texts/sec | `hybrid` texts/sec | `hashing` texts/sec |
|---|---:|---:|---:|---:|
| 1 word | `~5` | `2,129,815` | `732,628` | `1,493,805` |
| short query / headline | `~61` | `995,892` | `413,575` | `766,403` |
| sentence | `~145` | `488,485` | `241,449` | `493,440` |
| paragraph | `~654` | `129,252` | `66,846` | `139,140` |
| long document | `~3143` | `26,158` | `15,171` | `34,105` |

## Retrieval Quality

BEIR-6 average:

| system | nDCG@10 | nDCG@100 |
|---|---:|---:|
| `static` mode (default, WASM) | `0.3727` | `0.3900` |
| `static` + rerank@384 (WASM, top-100) | `0.3510` | `0.3632` |
| `hybrid` mode (WASM) | `0.3771` | `0.3935` |
| `hashing` mode (WASM) | `0.2469` | `0.2565` |
| BM25 | `0.3191` | `0.3173` |

Per-dataset nDCG@10:

| dataset | `static` | `static` + rerank@384 | `hybrid` | `hashing` | BM25 |
|---|---:|---:|---:|---:|---:|
| nfcorpus | `0.3225` | `0.3115` | `0.3234` | `0.2207` | `0.2672` |
| scifact | `0.6294` | `0.6541` | `0.6359` | `0.4755` | `0.5597` |
| arguana | `0.4402` | `0.2144` | `0.4408` | `0.2262` | `0.3461` |
| scidocs | `0.1443` | `0.1233` | `0.1475` | `0.1020` | `0.1366` |
| fiqa | `0.1892` | `0.1648` | `0.1941` | `0.1118` | `0.1591` |
| trec-covid | `0.5105` | `0.6376` | `0.5209` | `0.3454` | `0.4474` |

The table reports pure WASM late-interaction rerank over the static top-100 candidates at 384 dims. Pure rerank helps SciFact and TREC-COVID, but hurts ArguAna and lowers the BEIR-6 average; for query-style workloads, blend with first-stage `baseScores` so rerank refines rather than replaces the vector score.

## Similarity Quality

| benchmark | mode | metric 1 | metric 2 |
|---|---|---:|---:|
| `GLUE STS-B` | `static` | Spearman `0.8335` | Pearson `0.8376` |
| `GLUE STS-B` | `hybrid` | Spearman `0.8337` | Pearson `0.8376` |
| `GLUE STS-B` | `hashing` | Spearman `0.7078` | Pearson `0.7066` |
| `SprintDuplicateQuestionsPC` | `static` | max AP `0.9347` | — |
| `SprintDuplicateQuestionsPC` | `hybrid` | max AP `0.9371` | — |
| `TwitterURLCorpusPC` | `static` | max AP `0.8194` | — |

`static` dimension tradeoff:

| output dim | size vs full | BEIR-6 nDCG@10 | of full |
|---:|---:|---:|---:|
| `512` (default) | 100% | `0.3761` | 100% |
| `384` | 75% | `0.3731` | 99.2% |
| `256` | 50% | `0.3664` | 97.4% |
| `128` | 25% | `0.3458` | 91.9% |

## API

- `embed(text, options?)`
- `embedBatch(texts, options?)`
- `createQuickiEmbed(options?)`
- `getQuickiEmbed(options?)`
- `QuickiEmbed.create(options?)`
- `QuickiEmbed.fromURL(url, dim?, mode?)`
- `QuickiEmbed.fromFile(pathOrUrl, dim?, mode?)`
- `QuickiEmbed.fromBytes(bytes, dim?, mode?)`

Instance methods:

- `setIdf(idf)`
- `clearIdf()`
- `setTokenIdf(idf)`
- `clearTokenIdf()`
- `fitIdf(texts)`
- `fitRetrieval(texts)`
- `embed(text)`
- `embedBatch(texts)`
- `scoreLateInteraction(query, document)`
- `scoreLateInteractionBatch(query, documents)`
- `rerank(query, documents, options?)`
- `close()`

Compatibility aliases:

- `FastEmbed`
- `createFastEmbed(...)`
- `getFastEmbed(...)`

## Built By

Built by Wesley at Burke Designs LLC.

[https://burkedesigns.biz](https://burkedesigns.biz/)
