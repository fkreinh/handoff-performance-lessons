# Optional engineering deep dives

The review page is `/prisma-deep-dives/`. Its five alternatives are authored in `content/prisma-deep-dives/v1.json` through `v5.json`. Each keeps title, teaser, paragraphs, and code separate from HTML. Rebuild the review page and Portable Text export with:

```sh
node scripts/build-deep-dives.mjs
```

There is no build step for the main article and no CI. Commit the generated review page, then publish manually with the existing Wrangler setup.

## Move the selected version into Sanity

`deepDive.ts` defines two Studio object types. Register `engineeringCode` and `engineeringDeepDive` in the future Studio's `schema.types`. Add `{type: 'engineeringDeepDive'}` to the article body's array `of` list alongside its existing Portable Text block type.

`prisma-variants.json` contains five matching Portable Text objects in V1–V5 order. Insert **only the selected object** in the article body after the Prisma section. This is an array of embedded objects, not an NDJSON document import; do not feed it directly to `sanity dataset import`. An import script would need to patch the chosen article document.

The frontend renders `engineeringDeepDive` as native `<details>` with `<summary>` for its title and teaser, then renders its body with the site's Portable Text renderer. Render `engineeringCode` as escaped, selectable `<pre><code>` text and an optional copy button. Existing images stay ordinary image blocks. No accordion HTML is stored in the CMS.

The V1–V5 labels, local preference, and comparison controls belong only to this review page, not the published article. Sanity is not installed or connected in this static repository; the schema is a handoff example to validate in the eventual Studio.

Sanity references: [custom object types](https://www.sanity.io/docs/studio/object-type), [Portable Text configuration](https://www.sanity.io/docs/studio/portable-text-editor-configuration).

## Article implementation notes

`article-deep-dives.json` contains one `engineeringDeepDive` object. Insert it after the Prisma bonus and before the conclusion. Its title, “Code examples and implementation notes,” renders as a compact native disclosure summary without a separate introductory paragraph or box. Its body holds seven headings and the existing code examples and explanations, with no nested accordions. The source is `content/article-deep-dives.json`; run `node scripts/build-article-deep-dives.mjs` after editing it to refresh HTML, Markdown, and Portable Text together. Existing links such as `#persistence-implementation` open the shared accordion at the matching heading. The original five Prisma alternatives remain available on the review page.
