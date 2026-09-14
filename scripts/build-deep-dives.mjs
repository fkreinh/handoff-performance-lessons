import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inline = (value) => value.split(/(`[^`]+`)/g).map((part) => part.startsWith('`') ? `<code>${escape(part.slice(1, -1))}</code>` : escape(part)).join('');
const versions = await Promise.all([1, 2, 3, 4, 5].map(async (number) => {
  const entry = JSON.parse(await readFile(new URL(`content/prisma-deep-dives/v${number}.json`, root), 'utf8'));
  if (entry.version !== `v${number}` || !entry.title || !entry.teaser || !Array.isArray(entry.blocks)) throw new Error(`Invalid version ${number}`);
  for (const block of entry.blocks) {
    if (!['paragraph', 'heading', 'code'].includes(block.type)) throw new Error('Unknown block type');
    if (typeof (block.type === 'code' ? block.code : block.text) !== 'string') throw new Error('Missing block content');
  }
  return entry;
}));
function renderBlock(block) {
  if (block.type === 'paragraph') return `<p>${inline(block.text)}</p>`;
  if (block.type === 'heading') return `<h3>${inline(block.text)}</h3>`;
  const renderedCode = block.language === 'diff' ? block.code.split('\n').map((line) => `<span class="diff-line ${line.startsWith('+') ? 'addition' : line.startsWith('-') ? 'removal' : ''}">${escape(line)}</span>`).join('\n') : escape(block.code);
  return `<figure class="code-block"><figcaption><span>${escape(block.label || block.language)}</span><button class="copy-code" type="button" aria-label="Copy ${escape(block.label || 'code')}">Copy</button></figcaption><pre tabindex="0" aria-label="${escape(block.label || block.language)}"><code>${renderedCode}</code></pre></figure>`;
}
const accordions = versions.map((entry) => `<section class="option" id="${entry.version}">
  <div class="option-meta"><span>${entry.version.toUpperCase()} <span class="meta-dot">/</span> ${escape(entry.direction)}</span></div>
  <details>
    <summary><span><span class="summary-title">${escape(entry.title)}</span><span class="teaser">${escape(entry.teaser)}</span></span><span class="plus" aria-hidden="true"></span></summary>
    <div class="body">${entry.blocks.map(renderBlock).join('\n')}<div class="option-footer"><button class="choose" type="button" data-version="${entry.version}" aria-pressed="false">Choose ${entry.version.toUpperCase()}</button><a href="#${entry.version}" aria-label="Link to ${entry.version.toUpperCase()}">Link to this version <span aria-hidden="true">↗</span></a></div></div>
  </details>
</section>`).join('\n');
const template = await readFile(new URL('scripts/deep-dives.template.html', root), 'utf8');
await mkdir(new URL('public/prisma-deep-dives/', root), { recursive: true });
await writeFile(new URL('public/prisma-deep-dives/index.html', root), template.replace('<!-- ACCORDIONS -->', accordions));

// Export the same content as Portable Text objects. Sanity owns content; the
// site's renderer owns whether a deep dive is presented as an accordion.
const portable = versions.map((entry) => ({
  _type: 'engineeringDeepDive',
  _key: `prisma-${entry.version}`,
  title: entry.title,
  teaser: entry.teaser,
  body: entry.blocks.map((block, index) => block.type === 'code' ? {
    _type: 'engineeringCode', _key: `b${index}`, language: block.language, label: block.label || '', code: block.code,
  } : {
    _type: 'block', _key: `b${index}`, style: block.type === 'heading' ? 'h3' : 'normal', markDefs: [],
    children: block.text.split(/(`[^`]+`)/g).filter(Boolean).map((part, spanIndex) => ({
      _type: 'span', _key: `s${spanIndex}`, text: part.startsWith('`') ? part.slice(1, -1) : part,
      marks: part.startsWith('`') ? ['code'] : [],
    })),
  }),
}));
await writeFile(new URL('sanity/prisma-variants.json', root), JSON.stringify(portable, null, 2) + '\n');
console.log(`Built ${versions.length} accordions and matching Portable Text objects.`);
