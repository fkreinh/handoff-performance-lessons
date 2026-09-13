# Small changes, big performance wins

A public draft by Krein about performance lessons from Handoff.

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
