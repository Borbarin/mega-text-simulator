<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchFishWords } from './lib/fishText.js'
import { alignWord, collectStats, isPartialWord, rateStats } from './lib/typing.js'

const TIME_PRESETS = [15, 30, 60, 120]
const WORD_PRESETS = [10, 25, 50, 100]
const TIME_BUFFER = 180
const EXTRA_LIMIT = 24

const mode = ref('time')
const timeLimit = ref(30)
const wordCount = ref(25)
const customTime = ref('30')
const customWords = ref('25')

const pool = ref([])
const words = ref([])
const typed = ref([])
const current = ref(0)
const loading = ref(false)
const error = ref('')
const startedAt = ref(null)
const finishedAt = ref(null)
const finished = ref(false)
const now = ref(Date.now())
const shift = ref(0)

const inputRef = ref(null)
const wordsRef = ref(null)
const windowRef = ref(null)

let requestId = 0
let ticker = 0
let extending = false
let fromKeyboard = false

const running = computed(() => startedAt.value !== null && !finished.value)

const elapsedMs = computed(() => {
  if (!startedAt.value) return 0
  const end = finishedAt.value ?? now.value
  return Math.max(0, end - startedAt.value)
})

const hud = computed(() => {
  if (mode.value === 'time') {
    if (!startedAt.value) return String(timeLimit.value)
    const remaining = Math.max(0, timeLimit.value * 1000 - elapsedMs.value)
    return String(Math.ceil(remaining / 1000))
  }
  const done = finished.value ? words.value.length : current.value
  return `${done}/${words.value.length || wordCount.value}`
})

const counts = computed(() => collectStats(words.value, typed.value, current.value, {
  finished: finished.value,
  mode: mode.value,
}))

const stats = computed(() => rateStats(counts.value, elapsedMs.value))

const renderedWords = computed(() => words.value.map((target, index) => {
  const value = typed.value[index] || ''
  const nodes = alignWord(target, value)
  const committed = index < current.value || (finished.value && mode.value === 'words')
  const partial = isPartialWord(nodes, committed)
  const active = !finished.value && index === current.value
  return {
    partial,
    active,
    nodes: active ? withCaret(nodes) : nodes,
  }
}))

const wordsStyle = computed(() => ({
  transform: `translateY(-${shift.value}px)`,
}))

watch(timeLimit, (value) => {
  customTime.value = String(value)
})

watch(wordCount, (value) => {
  customWords.value = String(value)
})

watch([current, words, finished], async () => {
  await nextTick()
  updateShift()
})

onMounted(() => {
  loadText(false)
  window.addEventListener('resize', updateShift)
})

onUnmounted(() => {
  stopClock()
  window.removeEventListener('resize', updateShift)
})

function withCaret(nodes) {
  const result = []
  let placed = false
  for (const node of nodes) {
    if (!placed && node.state === 'pending') {
      result.push({ caret: true })
      placed = true
    }
    result.push(node)
  }
  if (!placed) result.push({ caret: true })
  return result
}

function neededWords() {
  return mode.value === 'time' ? TIME_BUFFER : wordCount.value
}

function applyWords() {
  words.value = mode.value === 'words'
    ? pool.value.slice(0, wordCount.value)
    : pool.value.slice()
}

async function loadText(replace) {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const fetched = await fetchFishWords(neededWords())
    if (id !== requestId) return
    pool.value = replace ? fetched : pool.value.concat(fetched)
    applyWords()
    resetProgress()
  } catch (reason) {
    if (id !== requestId) return
    error.value = reason instanceof Error ? reason.message : 'Не удалось получить текст'
  } finally {
    if (id === requestId) {
      loading.value = false
      await nextTick()
      focusCapture()
    }
  }
}

async function ensurePool() {
  const need = neededWords()
  if (pool.value.length >= need) {
    applyWords()
    return
  }
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const fetched = await fetchFishWords(need - pool.value.length)
    if (id !== requestId) return
    pool.value = pool.value.concat(fetched)
    applyWords()
  } catch (reason) {
    if (id !== requestId) return
    error.value = reason instanceof Error ? reason.message : 'Не удалось получить текст'
  } finally {
    if (id === requestId) {
      loading.value = false
      await nextTick()
      focusCapture()
    }
  }
}

function resetProgress() {
  stopClock()
  typed.value = []
  current.value = 0
  startedAt.value = null
  finishedAt.value = null
  finished.value = false
  shift.value = 0
  extending = false
}

function restart() {
  if (!pool.value.length) return
  applyWords()
  resetProgress()
  nextTick(() => focusCapture())
}

function nextTest() {
  resetProgress()
  pool.value = []
  words.value = []
  loadText(true)
}

async function selectMode(nextMode) {
  if (mode.value === nextMode) {
    focusCapture()
    return
  }
  mode.value = nextMode
  resetProgress()
  await ensurePool()
  resetProgress()
  focusCapture()
}

function selectTime(value) {
  timeLimit.value = value
  if (startedAt.value || finished.value) restart()
  else focusCapture()
}

async function selectWords(value) {
  wordCount.value = value
  resetProgress()
  await ensurePool()
  resetProgress()
  focusCapture()
}

function applyCustomTime() {
  const value = parseAmount(customTime.value, 600)
  if (value === null) {
    customTime.value = String(timeLimit.value)
    return
  }
  if (value === timeLimit.value) {
    focusCapture()
    return
  }
  selectTime(value)
}

function applyCustomWords() {
  const value = parseAmount(customWords.value, 500)
  if (value === null) {
    customWords.value = String(wordCount.value)
    return
  }
  if (value === wordCount.value) {
    focusCapture()
    return
  }
  selectWords(value)
}

function parseAmount(raw, max) {
  const text = String(raw).trim()
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  if (value < 1 || value > max) return null
  return value
}

function focusCapture() {
  inputRef.value?.focus()
}

function begin() {
  if (startedAt.value || finished.value) return
  startedAt.value = Date.now()
  now.value = startedAt.value
  ticker = window.setInterval(() => {
    now.value = Date.now()
    if (mode.value === 'time' && now.value - startedAt.value >= timeLimit.value * 1000) {
      finish()
    }
  }, 50)
}

function stopClock() {
  if (ticker) window.clearInterval(ticker)
  ticker = 0
}

function finish() {
  if (finished.value) return
  if (!startedAt.value) startedAt.value = Date.now()
  const elapsed = Date.now() - startedAt.value
  const cap = mode.value === 'time' ? timeLimit.value * 1000 : elapsed
  finishedAt.value = startedAt.value + Math.min(elapsed, cap)
  finished.value = true
  now.value = finishedAt.value
  stopClock()
}

function onChar(ch) {
  if (!canType() || ch === ' ') return
  begin()
  const index = current.value
  const target = words.value[index]
  const value = typed.value[index] || ''
  if (!target || value.length >= target.length + EXTRA_LIMIT) return
  const next = value + ch
  setTyped(index, next)
  if (mode.value === 'words' && index === words.value.length - 1 && next === target) {
    finish()
    return
  }
  queueExtend()
}

function onSpace() {
  if (!canType()) return
  begin()
  const index = current.value
  const target = words.value[index]
  if (!target) return
  const value = typed.value[index] || ''

  const hasCharacter = [...value].some((ch) => ch !== ' ')
  if (value === target || hasCharacter) {
    advance()
    return
  }

  if (value.length < target.length + EXTRA_LIMIT) {
    setTyped(index, `${value} `)
  }
}

function onBackspace() {
  if (!canType()) return
  const index = current.value
  const value = typed.value[index] || ''
  if (value.length > 0) {
    setTyped(index, value.slice(0, -1))
    return
  }
  if (index === 0) return
  current.value -= 1
}

function clearCurrent() {
  if (!canType()) return
  setTyped(current.value, '')
}

async function advance() {
  if (current.value < words.value.length - 1) {
    current.value += 1
    void queueExtend()
    return
  }
  if (mode.value === 'words') {
    finish()
    return
  }

  const added = await queueExtend(true)
  if (finished.value) return
  if (current.value < words.value.length - 1) {
    current.value += 1
    return
  }
  if (!added) finish()
}

function setTyped(index, value) {
  const next = typed.value.slice()
  next[index] = value
  typed.value = next
}

function canType() {
  return !loading.value && !finished.value && !error.value && words.value.length > 0
}

async function queueExtend(force = false) {
  if (mode.value !== 'time' || finished.value || extending) return false
  if (!force && words.value.length - current.value > 40) return false

  extending = true
  const before = words.value.length
  try {
    const more = await fetchFishWords(80)
    if (mode.value !== 'time' || finished.value) return false
    pool.value = pool.value.concat(more)
    words.value = words.value.concat(more)
    return words.value.length > before
  } catch {
    return false
  } finally {
    extending = false
  }
}

function updateShift() {
  const active = wordsRef.value?.querySelector('.word.active')
  const view = windowRef.value
  const content = wordsRef.value
  if (!active || !view || !content || finished.value) {
    shift.value = 0
    return
  }
  const next = active.offsetTop - active.offsetHeight
  const max = Math.max(0, content.scrollHeight - view.clientHeight)
  shift.value = Math.min(max, Math.max(0, next))
}

function onKeyDown(event) {
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }
  if (event.isComposing) return

  if (event.ctrlKey || event.metaKey || event.altKey) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      markKeyboard()
      clearCurrent()
    }
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    markKeyboard()
    onSpace()
    return
  }
  if (event.key === 'Backspace') {
    event.preventDefault()
    markKeyboard()
    onBackspace()
    return
  }
  if (event.key.length === 1) {
    event.preventDefault()
    markKeyboard()
    onChar(event.key)
  }
}

function markKeyboard() {
  fromKeyboard = true
  setTimeout(() => {
    fromKeyboard = false
  }, 0)
}

function onBeforeInput(event) {
  if (fromKeyboard) {
    fromKeyboard = false
    event.preventDefault()
    return
  }
  if (event.inputType === 'insertText' && event.data) {
    event.preventDefault()
    for (const ch of event.data) {
      if (ch === ' ') onSpace()
      else if (ch !== '\n' && ch !== '\r') onChar(ch)
    }
    return
  }
  if (event.inputType === 'deleteContentBackward') {
    event.preventDefault()
    onBackspace()
    return
  }
  if (
    event.inputType === 'insertFromPaste'
    || event.inputType === 'insertLineBreak'
    || event.inputType.startsWith('delete')
  ) {
    event.preventDefault()
  }
}

function onCustomTimeKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    applyCustomTime()
  }
}

function onCustomWordsKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    applyCustomWords()
  }
}
</script>

<template>
  <div class="page">
    <div class="column">
      <header class="brand">
        <h1>mega type</h1>
        <p>тест скорости печати</p>
      </header>

      <div class="config" :class="{ 'is-running': running }">
        <div class="group" role="group" aria-label="Режим">
          <button
            type="button"
            :class="{ active: mode === 'time' }"
            :aria-pressed="mode === 'time'"
            @click="selectMode('time')"
          >
            время
          </button>
          <button
            type="button"
            :class="{ active: mode === 'words' }"
            :aria-pressed="mode === 'words'"
            @click="selectMode('words')"
          >
            слова
          </button>
        </div>

        <div v-if="mode === 'time'" class="group" role="group" aria-label="Количество секунд">
          <button
            v-for="preset in TIME_PRESETS"
            :key="preset"
            type="button"
            :class="{ active: timeLimit === preset }"
            @click="selectTime(preset)"
          >
            {{ preset }}
          </button>
          <label class="custom">
            <input
              v-model="customTime"
              type="number"
              min="1"
              max="600"
              inputmode="numeric"
              aria-label="Своё количество секунд"
              @change="applyCustomTime"
              @keydown="onCustomTimeKey"
            />
          </label>
        </div>

        <div v-else class="group" role="group" aria-label="Количество слов">
          <button
            v-for="preset in WORD_PRESETS"
            :key="preset"
            type="button"
            :class="{ active: wordCount === preset }"
            @click="selectWords(preset)"
          >
            {{ preset }}
          </button>
          <label class="custom">
            <input
              v-model="customWords"
              type="number"
              min="1"
              max="500"
              inputmode="numeric"
              aria-label="Своё количество слов"
              @change="applyCustomWords"
              @keydown="onCustomWordsKey"
            />
          </label>
        </div>
      </div>

      <div class="hud" aria-live="polite">{{ loading || error || finished ? '' : hud }}</div>

      <div class="stage">
        <p v-if="loading" class="status">Загружаем текст…</p>
        <p v-else-if="error" class="status error">
          <span>{{ error }}</span>
          <button type="button" class="linkish" @click="nextTest">Повторить</button>
        </p>
        <div v-else-if="finished" class="results" aria-live="polite">
          <div>
            <div class="stat-value">{{ stats.wpm }}</div>
            <div class="stat-label">wpm</div>
          </div>
          <div>
            <div class="stat-value">{{ stats.accuracy }}%</div>
            <div class="stat-label">точность</div>
          </div>
          <div>
            <div class="stat-value">{{ stats.cpm }}</div>
            <div class="stat-label">зн/мин</div>
          </div>
          <div>
            <div class="stat-value">{{ (elapsedMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) }}</div>
            <div class="stat-label">секунды</div>
          </div>
          <p class="stat-detail">
            верно {{ stats.correct }} · ошибки {{ stats.incorrect }} · лишние {{ stats.extra }}
          </p>
        </div>
        <div v-else ref="windowRef" class="words-window" @pointerdown="focusCapture">
          <p ref="wordsRef" class="words" :style="wordsStyle">
            <span
              v-for="(word, wordIndex) in renderedWords"
              :key="wordIndex"
              class="word"
              :class="{ partial: word.partial, active: word.active }"
            >
              <template v-for="(node, nodeIndex) in word.nodes" :key="nodeIndex">
                <span v-if="node.caret" class="caret-host" aria-hidden="true"><span class="caret"></span></span>
                <span
                  v-else
                  class="letter"
                  :class="[node.state, { space: node.space }]"
                  :data-state="node.state"
                >{{ node.space ? '' : node.ch }}</span>
              </template>
            </span>
          </p>
          <input
            ref="inputRef"
            class="capture"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            aria-label="Поле ввода теста"
            @keydown="onKeyDown"
            @beforeinput="onBeforeInput"
            @paste.prevent
          />
        </div>
      </div>

      <div class="actions">
        <button type="button" :disabled="loading || !pool.length" @click="restart">
          Заново
        </button>
        <button type="button" :disabled="loading" @click="nextTest">
          Следующий тест
        </button>
      </div>
    </div>
  </div>
</template>
