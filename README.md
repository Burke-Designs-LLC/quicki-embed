# QuickiEmbed

**The fastest text embedding model. Period.**

QuickiEmbed is a retrieval-tuned embedding runtime for browsers, Node.js, Bun, Deno, and edge runtimes.

- **Up to `1,038,538 texts/sec` in batch**
- **Up to `2,185,567 texts/sec` on tiny inputs**
- **Beats BM25 on BEIR-6 average in the default mode**
- **Ships in modes from `~32 MB` down to `~50 KB`**

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
| `static` (default) | `512` | `775,964 texts/sec` | `1,038,538 texts/sec` |
| `hybrid` | `1536` | `380,033 texts/sec` | `429,676 texts/sec` |
| `hashing` | `1024` | `712,393 texts/sec` | `807,419 texts/sec` |

First real `embed()` call after `QuickiEmbed.create()` / `fromFile()` resolves:

| mode | median latency | average latency |
|---|---:|---:|
| `static` (default) | `0.0113 ms` | `0.0117 ms` |
| `hybrid` | `0.0150 ms` | `0.0147 ms` |
| `hashing` | `0.0041 ms` | `0.0046 ms` |

Representative single-call throughput by input size:

| text shape | approx chars | `static` texts/sec | `hybrid` texts/sec | `hashing` texts/sec |
|---|---:|---:|---:|---:|
| 1 word | `~5` | `2,185,567` | `724,433` | `1,436,637` |
| short query / headline | `~61` | `780,117` | `377,767` | `672,708` |
| sentence | `~145` | `431,486` | `220,175` | `434,686` |
| paragraph | `~654` | `94,510` | `57,354` | `116,750` |
| long document | `~3143` | `20,664` | `12,064` | `24,069` |

## Retrieval Quality

BEIR-6 average:

| system | nDCG@10 | nDCG@100 |
|---|---:|---:|
| `static` mode (default) | `0.3761` | `0.3921` |
| `hybrid` mode | `0.3801` | `0.3955` |
| `hashing` mode | `0.2469` | `0.2564` |
| BM25 | `0.3191` | `0.3173` |

Per-dataset nDCG@10:

| dataset | `static` | `hybrid` | `hashing` | BM25 |
|---|---:|---:|---:|---:|
| nfcorpus | `0.3218` | `0.3232` | `0.2207` | `0.2672` |
| scifact | `0.6320` | `0.6395` | `0.4755` | `0.5597` |
| arguana | `0.4450` | `0.4465` | `0.2258` | `0.3461` |
| scidocs | `0.1447` | `0.1479` | `0.1020` | `0.1366` |
| fiqa | `0.1961` | `0.2014` | `0.1118` | `0.1591` |
| trec-covid | `0.5169` | `0.5225` | `0.3454` | `0.4474` |

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
- `close()`

Compatibility aliases:

- `FastEmbed`
- `createFastEmbed(...)`
- `getFastEmbed(...)`

## Built By

Built by Wesley at Burke Designs LLC.

[https://burkedesigns.biz](https://burkedesigns.biz/)
