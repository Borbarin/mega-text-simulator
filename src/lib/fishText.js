const SENTENCE_WORDS = 12

export function textToWords(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export async function fetchFishWords(minWords) {
  const target = Math.max(1, minWords)
  let sentences = clamp(Math.ceil(target / SENTENCE_WORDS), 2, 80)
  let lastError = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const words = textToWords(await requestFishText(sentences))
      if (words.length >= target || attempt === 2) return words
    } catch (error) {
      lastError = error
    }
    sentences = clamp(sentences * 2, 2, 80)
  }

  throw lastError instanceof Error ? lastError : new Error('Не удалось получить текст')
}

async function requestFishText(sentences) {
  const params = new URLSearchParams({
    type: 'sentence',
    number: String(sentences),
    format: 'json',
  })
  const response = await fetch(`/fish-text?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Сервис текста сейчас недоступен')
  }

  const data = await response.json()
  if (data.status !== 'success' || typeof data.text !== 'string' || !data.text.trim()) {
    throw new Error(typeof data.text === 'string' ? data.text : 'Не удалось получить текст')
  }

  return data.text
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
