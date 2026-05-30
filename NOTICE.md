# Third-Party Notices

This package includes `quicki-embed.wasm` and `quicki-embed-hybrid.wasm` builds
that embed semantic model assets derived from the following upstream model:

- `minishlab/potion-retrieval-32M`
  - Source: <https://huggingface.co/minishlab/potion-retrieval-32M>
  - Model card license field: `mit`

The embedded semantic assets were produced by transforming a local snapshot of
that model into a compact runtime format for this package.

Related upstream projects referenced by the model card:

- `MinishLab/model2vec`
  - Source: <https://github.com/MinishLab/model2vec>
  - Repository license: `MIT`

- `MinishLab/tokenlearn`
  - Source: <https://github.com/MinishLab/tokenlearn>
  - Repository license: `MIT`

The JavaScript wrapper and package-specific runtime code in this npm package are
licensed under Apache-2.0. The upstream assets and projects listed above remain
subject to their own license terms.
