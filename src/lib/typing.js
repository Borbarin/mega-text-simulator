/** @typedef {'correct' | 'incorrect' | 'extra' | 'pending'} LetterState */

/**
 * @param {string} target
 * @param {string} typed
 * @returns {{ ch: string, state: LetterState, space: boolean }[]}
 */
export function alignWord(target, typed) {
  const nodes = []
  let targetIndex = 0

  for (const ch of typed) {
    if (ch === ' ') {
      nodes.push({ ch: ' ', state: 'extra', space: true })
      continue
    }

    if (targetIndex < target.length) {
      const expected = target[targetIndex]
      targetIndex += 1
      const correct = ch === expected
      nodes.push({
        ch: correct ? expected : ch,
        state: correct ? 'correct' : 'incorrect',
        space: false,
      })
    } else {
      nodes.push({ ch, state: 'extra', space: false })
    }
  }

  while (targetIndex < target.length) {
    nodes.push({ ch: target[targetIndex], state: 'pending', space: false })
    targetIndex += 1
  }

  return nodes
}

/**
 * A word is partial when it contains correct characters together with
 * mistakes: wrong letters, extra symbols, or letters left untyped after
 * the word was left.
 * @param {{ state: string }[]} nodes
 * @param {boolean} committed
 */
export function isPartialWord(nodes, committed) {
  let correct = false
  let incorrect = false
  let extra = false
  let pending = false

  for (const node of nodes) {
    if (node.state === 'correct') correct = true
    else if (node.state === 'incorrect') incorrect = true
    else if (node.state === 'extra') extra = true
    else if (node.state === 'pending') pending = true
  }

  return correct && (incorrect || extra || (committed && pending))
}

/**
 * @param {string[]} words
 * @param {string[]} typedWords
 * @param {number} currentIndex
 * @param {{ finished: boolean, mode: 'time' | 'words' }} options
 */
export function collectStats(words, typedWords, currentIndex, options) {
  let correct = 0
  let incorrect = 0
  let extra = 0

  for (let index = 0; index < words.length; index += 1) {
    if (index > currentIndex) break

    const nodes = alignWord(words[index], typedWords[index] || '')
    const countSkipped = index < currentIndex || (options.finished && options.mode === 'words')

    for (const node of nodes) {
      if (node.state === 'correct') correct += 1
      else if (node.state === 'incorrect') incorrect += 1
      else if (node.state === 'extra') extra += 1
      else if (node.state === 'pending' && countSkipped) incorrect += 1
    }
  }

  return { correct, incorrect, extra }
}

/**
 * @param {{ correct: number, incorrect: number, extra: number }} counts
 * @param {number} elapsedMs
 */
export function rateStats(counts, elapsedMs) {
  const total = counts.correct + counts.incorrect + counts.extra
  const minutes = elapsedMs > 0 ? elapsedMs / 60000 : 0
  const wpm = minutes > 0 ? Math.round(counts.correct / 5 / minutes) : 0
  const cpm = minutes > 0 ? Math.round(counts.correct / minutes) : 0
  const accuracy = total > 0 ? Math.round((counts.correct / total) * 1000) / 10 : 100

  return { wpm, cpm, accuracy, ...counts }
}
