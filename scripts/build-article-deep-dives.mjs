import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const entries = JSON.parse(await readFile(new URL('content/article-deep-dives.json', root), 'utf8'));
const sectionIds = ['calculations', 'cache', 'navigation', 'sheets', 'persistence', 'bundles', 'dx'];
if (JSON.stringify(entries.map((entry) => entry.section)) !== JSON.stringify(sectionIds)) throw new Error('Expected seven article sections in order');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inline = (text) => text.split(/(`[^`]+`)/g).map((part) => part.startsWith('`') ? `<code>${escape(part.slice(1, -1))}</code>` : escape(part)).join('');
function blockHtml(block, index) {
  if (block.type === 'paragraph') return `<p>${inline(block.text)}</p>`;
  if (block.type !== 'code') throw new Error('Unsupported article block');
  const code = block.language === 'diff' ? block.code.split('\n').map((line) => `<span class="${line.startsWith('+') ? 'dd-add' : line.startsWith('-') ? 'dd-remove' : 'dd-context'}">${escape(line)}</span>`).join('\n') : escape(block.code);
  return `<figure class="deep-code"><figcaption><span>${escape(block.label)}</span><button type="button" class="deep-copy" aria-label="Copy code: ${escape(block.label)}. Example ${index + 1}.">Copy</button></figcaption><pre tabindex="0" aria-label="${escape(block.label)}"><code>${code}</code></pre></figure>`;
}
const noteLabel = 'Code examples and implementation notes';
const noteHtml = entries.map((entry) => `<div class="deep-note"><h3 id="${entry.section}-implementation">${escape(entry.title)}</h3>${entry.blocks.map(blockHtml).join('\n')}</div>`).join('\n');
const accordionHtml = `<!-- deep-dive:all:start -->\n<details class="deep-dive" id="under-the-hood"><summary>${escape(noteLabel)}</summary><div class="deep-body">${noteHtml}</div></details>\n<!-- deep-dive:all:end -->\n`;
let html = await readFile(new URL('public/index.html', root), 'utf8');
html = html.replace(/<!-- deep-dive:([a-z]+):start -->[\s\S]*?<!-- deep-dive:\1:end -->\n/g, '');
let insertions = 0;
html = html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/g, (section) => {
  if (!section.includes('id="dx"')) return section;
  insertions++;
  return section.replace('</section>', `${accordionHtml}</section>`);
});
if (insertions !== 1) throw new Error('Expected one Prisma section');
if (!html.includes('href="/deep-dives.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/deep-dives.css">\n  </head>');
if (!html.includes('src="/deep-dives.js"')) html = html.replace('</body>', '  <script src="/deep-dives.js" defer></script>\n  </body>');

let md = await readFile(new URL('article.md', root), 'utf8');
md = md.replace(/<!-- deep-dive:([a-z]+):start -->[\s\S]*?<!-- deep-dive:\1:end -->\n(?:\n)?/g, '');
const noteMd = entries.map((entry) => `### ${entry.title}\n\n${entry.blocks.map((block) => block.type === 'paragraph' ? block.text : `_${block.label}_\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``).join('\n\n')}`).join('\n\n');
const accordionMd = `<!-- deep-dive:all:start -->\n<details>\n<summary>${noteLabel}</summary>\n\n${noteMd}\n\n</details>\n<!-- deep-dive:all:end -->\n\n`;
if (!md.includes('## The small wins add up')) throw new Error('Missing conclusion');
md = md.replace('## The small wins add up', `${accordionMd}## The small wins add up`).trimEnd() + '\n';

const textBlock = (key, text, style = 'normal') => ({
  _type: 'block', _key: key, style, markDefs: [],
  children: text.split(/(`[^`]+`)/g).filter(Boolean).map((part, i) => ({
    _type: 'span', _key: `s${i}`, text: part.startsWith('`') ? part.slice(1, -1) : part, marks: part.startsWith('`') ? ['code'] : [],
  })),
});
const portable = [{
  _type: 'engineeringDeepDive', _key: 'under-the-hood', title: noteLabel,
  body: entries.flatMap((entry) => [
    textBlock(`${entry.section}-heading`, entry.title, 'h3'),
    ...entry.blocks.map((block, index) => block.type === 'code' ? {
      _type: 'engineeringCode', _key: `${entry.section}-b${index}`, language: block.language, label: block.label, code: block.code,
    } : textBlock(`${entry.section}-b${index}`, block.text)),
  ]),
}];
await writeFile(new URL('public/index.html', root), html);
await writeFile(new URL('article.md', root), md);
await writeFile(new URL('sanity/article-deep-dives.json', root), JSON.stringify(portable, null, 2) + '\n');
console.log('Built one native disclosure after the Prisma bonus with seven sections in HTML, Markdown, and Portable Text.');
