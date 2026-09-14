import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const entries = JSON.parse(await readFile(new URL('content/article-deep-dives.json', root), 'utf8'));
const sectionIds = ['calculations', 'cache', 'navigation', 'sheets', 'persistence', 'bundles', 'dx'];
if (JSON.stringify(entries.map((entry) => entry.section)) !== JSON.stringify(sectionIds)) throw new Error('Expected seven article sections in order');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inline = (text) => text.split(/(`[^`]+`)/g).map((part) => part.startsWith('`') ? `<code>${escape(part.slice(1, -1))}</code>` : escape(part)).join('');
function blockHtml(block, entry, index) {
  if (block.type === 'paragraph') return `<p>${inline(block.text)}</p>`;
  if (block.type !== 'code') throw new Error('Unsupported article block');
  const code = block.language === 'diff' ? block.code.split('\n').map((line) => `<span class="${line.startsWith('+') ? 'dd-add' : line.startsWith('-') ? 'dd-remove' : 'dd-context'}">${escape(line)}</span>`).join('\n') : escape(block.code);
  return `<figure class="deep-code"><figcaption><span>${escape(block.label)}</span><button type="button" class="deep-copy" aria-label="Copy code: ${escape(block.label)}. Example ${index + 1}.">Copy</button></figcaption><pre tabindex="0" aria-label="${escape(block.label)}"><code>${code}</code></pre></figure>`;
}
function accordion(entry) {
  return `<!-- deep-dive:${entry.section}:start -->\n<details class="deep-dive" id="${entry.section}-implementation"><summary><span class="deep-title">${escape(entry.title)}</span><span class="deep-toggle" aria-hidden="true"></span></summary><div class="deep-body">${entry.blocks.map((block, index) => blockHtml(block, entry, index)).join('\n')}</div></details>\n<!-- deep-dive:${entry.section}:end -->\n`;
}
let html = await readFile(new URL('public/index.html', root), 'utf8');
html = html.replace(/<!-- deep-dive:([a-z]+):start -->[\s\S]*?<!-- deep-dive:\1:end -->\n/g, '');
for (const entry of entries) {
  let count = 0;
  html = html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/g, (section) => {
    if (!section.includes(`id="${entry.section}"`)) return section;
    count++;
    return section.replace('</section>', `${accordion(entry)}</section>`);
  });
  if (count !== 1) throw new Error(`Expected one section for ${entry.section}`);
}
if (!html.includes('href="/deep-dives.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/deep-dives.css">\n  </head>');
if (!html.includes('src="/deep-dives.js"')) html = html.replace('</body>', '  <script src="/deep-dives.js" defer></script>\n  </body>');
await writeFile(new URL('public/index.html', root), html);

let md = await readFile(new URL('article.md', root), 'utf8');
md = md.replace(/<!-- deep-dive:([a-z]+):start -->[\s\S]*?<!-- deep-dive:\1:end -->\n\n/g, '');
let cursor = 0;
md = md.replace(/(^## (?:[1-6]\. |Bonus:)[\s\S]*?)(?=^## |$(?![\s\S]))/gm, (section) => {
  const entry = entries[cursor++];
  const blocks = entry.blocks.map((block) => block.type === 'paragraph' ? block.text : `_${block.label}_\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``).join('\n\n');
  return `${section}<!-- deep-dive:${entry.section}:start -->\n<details>\n<summary>${escape(entry.title)}</summary>\n\n${blocks}\n\n</details>\n<!-- deep-dive:${entry.section}:end -->\n\n`;
});
if (cursor !== 7) throw new Error('Expected seven Markdown sections');
await writeFile(new URL('article.md', root), md);
const portable = entries.map((entry) => ({
  _type: 'engineeringDeepDive', _key: `${entry.section}-implementation`, title: entry.title,
  body: entry.blocks.map((block, index) => block.type === 'code' ? {
    _type: 'engineeringCode', _key: `b${index}`, language: block.language, label: block.label, code: block.code,
  } : {
    _type: 'block', _key: `b${index}`, style: 'normal', markDefs: [],
    children: block.text.split(/(`[^`]+`)/g).filter(Boolean).map((part, i) => ({
      _type: 'span', _key: `s${i}`, text: part.startsWith('`') ? part.slice(1, -1) : part, marks: part.startsWith('`') ? ['code'] : [],
    })),
  }),
}));
await writeFile(new URL('sanity/article-deep-dives.json', root), JSON.stringify(portable, null, 2) + '\n');
console.log('Added seven matching HTML, Markdown, and Portable Text deep dives.');
