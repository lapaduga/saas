export function chunkMarkdown(content, filename) {
  const chunks = [];
  const lines = content.split('\n');
  let currentHeading = filename;
  let currentChunk = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch && currentChunk.length > 0) {
      const text = currentChunk.join('\n').trim();
      if (text.length > 50) {
        chunks.push({ heading: currentHeading, content: text });
      }
      currentChunk = [];
      currentHeading = headingMatch[1].trim();
    }
    currentChunk.push(line);
  }

  if (currentChunk.length > 0) {
    const text = currentChunk.join('\n').trim();
    if (text.length > 50) {
      chunks.push({ heading: currentHeading, content: text });
    }
  }

  const enriched = [];
  for (let i = 0; i < chunks.length; i++) {
    let merged = chunks[i].content;
    if (i > 0 && chunks[i - 1].content.length > 0) {
      const overlap = chunks[i - 1].content.slice(-100);
      merged = overlap + '\n\n' + merged;
    }
    enriched.push({ heading: chunks[i].heading, content: merged });
  }

  return enriched;
}

export function chunkFaq(entry) {
  const content = `Вопрос: ${entry.question}\nОтвет: ${entry.answer}\nКатегория: ${entry.category}\nТеги: ${entry.tags.join(', ')}`;
  return [{ heading: entry.question, content }];
}

export function chunkJson(content, filename) {
  if (Array.isArray(content)) {
    return content.map((item, i) => ({
      heading: `${filename} #${i + 1}`,
      content: JSON.stringify(item, null, 2),
    }));
  }
  return [{ heading: filename, content: JSON.stringify(content, null, 2) }];
}
