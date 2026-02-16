/**
 * Minimal markdown renderer with HTML escaping.
 * Supports headings, paragraphs, lists, blockquotes, code fences, inline code, and links.
 */

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(line) {
  let safe = escapeHtml(line);

  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const trimmedHref = href.trim();
    const allowed = /^https?:\/\//.test(trimmedHref) || trimmedHref.startsWith('/') || trimmedHref.startsWith('#');
    const safeHref = allowed ? escapeHtml(trimmedHref) : '#';
    return `<a href="${safeHref}" rel="noopener noreferrer">${label}</a>`;
  });

  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return safe;
}

function appendParagraph(container, paragraphLines) {
  if (paragraphLines.length === 0) return;
  const paragraph = document.createElement('p');
  paragraph.innerHTML = renderInline(paragraphLines.join(' '));
  container.appendChild(paragraph);
  paragraphLines.length = 0;
}

export function renderMarkdown(markdown) {
  const source = String(markdown || '');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  const root = document.createElement('div');
  root.className = 'markdown-body';

  let paragraphLines = [];
  let list = null;
  let blockquote = null;
  let codePre = null;
  let codeBuffer = [];
  let codeLanguage = '';

  function closeList() {
    list = null;
  }

  function closeQuote() {
    blockquote = null;
  }

  function closeCodeBlock() {
    if (!codePre) return;
    const code = document.createElement('code');
    code.textContent = codeBuffer.join('\n');
    if (codeLanguage) {
      const normalizedLanguage = codeLanguage.replace(/[^a-zA-Z0-9_+-]/g, '').toLowerCase();
      if (normalizedLanguage) {
        code.dataset.language = normalizedLanguage;
        code.classList.add(`language-${normalizedLanguage}`);
      }
    }
    codePre.appendChild(code);
    root.appendChild(codePre);
    codePre = null;
    codeBuffer = [];
    codeLanguage = '';
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.startsWith('```')) {
      appendParagraph(root, paragraphLines);
      closeList();
      closeQuote();
      if (codePre) {
        closeCodeBlock();
      } else {
        codePre = document.createElement('pre');
        codeLanguage = line.slice(3).trim().split(/\s+/)[0] || '';
      }
      continue;
    }

    if (codePre) {
      codeBuffer.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      appendParagraph(root, paragraphLines);
      closeList();
      closeQuote();
      const level = headingMatch[1].length;
      const heading = document.createElement(`h${level}`);
      heading.innerHTML = renderInline(headingMatch[2]);
      root.appendChild(heading);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      appendParagraph(root, paragraphLines);
      closeQuote();
      if (!list) {
        list = document.createElement('ul');
        root.appendChild(list);
      }
      const item = document.createElement('li');
      item.innerHTML = renderInline(listMatch[1]);
      list.appendChild(item);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      appendParagraph(root, paragraphLines);
      closeList();
      if (!blockquote) {
        blockquote = document.createElement('blockquote');
        root.appendChild(blockquote);
      }
      const quoteLine = document.createElement('p');
      quoteLine.innerHTML = renderInline(quoteMatch[1]);
      blockquote.appendChild(quoteLine);
      continue;
    }

    if (line.trim() === '') {
      appendParagraph(root, paragraphLines);
      closeList();
      closeQuote();
      continue;
    }

    closeList();
    closeQuote();
    paragraphLines.push(line.trim());
  }

  appendParagraph(root, paragraphLines);
  closeCodeBlock();

  return root;
}

export default {
  renderMarkdown
};
