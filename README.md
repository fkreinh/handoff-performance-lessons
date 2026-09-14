# Small changes, big performance wins

A public draft by Krein about performance lessons from Handoff.

[Read the article](https://handoff-performance-lessons.fkrein.workers.dev/).

Plain HTML, local fonts, and seven selected image-model illustrations. No build step, backend, or CI.

## Files

- `public/index.html` — published page; edit this to update the site.
- `public/images/` — standalone PNG illustrations.
- `article.md` — CMS-friendly Markdown copy with images and alt text.
- `wrangler.jsonc` — static Cloudflare Workers deployment.

## Preview

```sh
python3 -m http.server 4341 --bind 127.0.0.1 --directory public
```

## Publish manually

```sh
npx wrangler@4.131.1 login
npx wrangler@4.131.1 deploy
```

Only `public/` is deployed. Authentication stays in Wrangler's local credential store, outside this repository. Keep the HTML and Markdown in sync when editing the article.

## Compare optional deep dives

[Review five Prisma accordion versions](https://handoff-performance-lessons.fkrein.workers.dev/prisma-deep-dives/). The original article remains separate.

Edit `content/prisma-deep-dives/v1.json` through `v5.json`, then run `node scripts/build-deep-dives.mjs` to refresh the static review page. A future Sanity schema and matching Portable Text objects are in `sanity/`; see [the handoff notes](sanity/README.md). The review page works without JavaScript; JavaScript adds code copying, bulk expansion, and a local preference. Choices are stored only in the reader's browser.

The main article now includes seven optional “Under the hood” accordions. Edit their structured content in `content/article-deep-dives.json`, then run `node scripts/build-article-deep-dives.mjs` to synchronize the HTML, Markdown, and Sanity export. The rest of the article remains hand-edited. Code samples are focused excerpts or labeled simplifications, not standalone application modules.
