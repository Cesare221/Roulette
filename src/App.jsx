import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'decision-maker:options-v1'
const THEME_KEY = 'decision-maker:theme-v1'
const HISTORY_KEY = 'decision-maker:history-v1'
const MAX_OPTIONS = 12
const MIN_OPTIONS_TO_SPIN = 2
const SPIN_DURATION_MS = 5400
const REDUCED_MOTION_SPIN_DURATION_MS = 1800

const DEFAULT_OPTIONS = ['Pizza', 'Sushi', 'Hambúrguer', 'Tacos', 'Ramen', 'Salada']

const SEGMENT_COLORS = [
  '#4f52d9',
  '#7c5dc5',
  '#3a3d8a',
  '#6366f1',
  '#5d4cb8',
  '#8083f7',
  '#4347a3',
  '#a78bfa',
  '#5b4fc2',
  '#3f3795',
  '#6b6fee',
  '#4942a8',
]

const PRESETS = [
  { id: 'food', label: 'O que comer', icon: 'utensils', items: ['Pizza', 'Sushi', 'Hambúrguer', 'Tacos', 'Ramen', 'Salada'] },
  { id: 'yesno', label: 'Sim ou Não', icon: 'check', items: ['Sim', 'Não'] },
  { id: 'movie', label: 'Noite de Filme', icon: 'film', items: ['Comédia', 'Suspense', 'Ficção Científica', 'Drama', 'Ação', 'Animação'] },
  { id: 'workout', label: 'Treino', icon: 'dumbbell', items: ['Correr', 'Yoga', 'Musculação', 'Ciclismo', 'Dia de Descanso'] },
]

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

function segmentPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

function truncate(text, max) {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

function loadOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_OPTIONS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed.slice(0, MAX_OPTIONS)
    }
    return DEFAULT_OPTIONS
  } catch {
    return DEFAULT_OPTIONS
  }
}

function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }

  return 'dark'
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((entry) => entry && typeof entry.id === 'number' && typeof entry.value === 'string' && typeof entry.at === 'string')) {
      return parsed.slice(0, 8)
    }
  } catch {}
  return []
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event) => setPrefersReducedMotion(event.matches)

    setPrefersReducedMotion(media.matches)
    media.addEventListener?.('change', update)

    return () => {
      media.removeEventListener?.('change', update)
    }
  }, [])

  return prefersReducedMotion
}

function sanitizeOptions(values) {
  const seen = new Set()
  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_OPTIONS)
}

function sanitizeImportedOptions(rawText) {
  return sanitizeOptions(
    rawText
      .replace(/\u00a0/g, ' ')
      .replace(/[•·]/g, '\n')
      .split(/\r?\n|;/)
      .map((value) =>
        value
          .trim()
          .replace(/^[\s*\-\u2022\d.)]+/, '')
          .replace(/^["'`]+|["'`]+$/g, ''),
      ),
  )
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  URL.revokeObjectURL(url)
}

function shuffleValues(values) {
  const next = [...values]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export default function App() {
  const [options, setOptions] = useState(loadOptions)
  const [draft, setDraft] = useState('')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winnerIdx, setWinnerIdx] = useState(null)
  const [theme, setTheme] = useState(loadTheme)
  const [history, setHistory] = useState(loadHistory)
  const [importText, setImportText] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const spinTimer = useRef(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  const spinDuration = prefersReducedMotion ? REDUCED_MOTION_SPIN_DURATION_MS : SPIN_DURATION_MS

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
    } catch {}
  }, [options])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {}
  }, [history])

  useEffect(() => {
    if (!feedbackMessage) return undefined
    const timer = window.setTimeout(() => setFeedbackMessage(''), 2200)
    return () => window.clearTimeout(timer)
  }, [feedbackMessage])

  useEffect(() => () => clearTimeout(spinTimer.current), [])

  const optionCount = options.length
  const canSpin = optionCount >= MIN_OPTIONS_TO_SPIN && !spinning
  const remainingSlots = MAX_OPTIONS - optionCount
  const wheelStatus = spinning ? 'Girando' : optionCount >= MIN_OPTIONS_TO_SPIN ? 'Pronta' : 'Aguardando'

  const addOption = useCallback(() => {
    const value = draft.trim()
    if (!value) {
      setFeedbackMessage('Digite algo para adicionar uma opção.')
      return
    }
    if (options.length >= MAX_OPTIONS) {
      setFeedbackMessage(`Limite de ${MAX_OPTIONS} opções atingido.`)
      return
    }
    if (options.some((o) => o.toLowerCase() === value.toLowerCase())) {
      setDraft('')
      setFeedbackMessage('Essa opção já existe na lista.')
      return
    }
    setOptions((prev) => [...prev, value.slice(0, 32)])
    setDraft('')
    setWinnerIdx(null)
    setFeedbackMessage('Opção adicionada.')
  }, [draft, options])

  const removeOption = useCallback(
    (idx) => {
      if (spinning) return
      setOptions((prev) => prev.filter((_, i) => i !== idx))
      setWinnerIdx(null)
    },
    [spinning],
  )

  const clearAll = useCallback(() => {
    if (spinning) return
    setOptions([])
    setWinnerIdx(null)
    setFeedbackMessage('Lista limpa.')
  }, [spinning])

  const importOptions = useCallback((rawText) => {
    const parsed = sanitizeImportedOptions(rawText)
    if (parsed.length === 0) {
      setFeedbackMessage('Nenhuma opção válida para importar.')
      return
    }
    setOptions(parsed)
    setImportText('')
    setWinnerIdx(null)
    setFeedbackMessage(`Importadas ${parsed.length} opções.`)
  }, [])

  const exportOptions = useCallback(async () => {
    if (options.length === 0) {
      setFeedbackMessage('Adicione opções antes de exportar.')
      return
    }
    try {
      const payload = options.join('\n')
      downloadTextFile('roleta-opcoes.txt', payload)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
      }
      setFeedbackMessage('Lista exportada como arquivo .txt e copiada para a área de transferência.')
    } catch {
      setFeedbackMessage('Não foi possível exportar as opções.')
    }
  }, [options])

  const clearHistory = useCallback(() => {
    setHistory([])
    setFeedbackMessage('Histórico limpo.')
  }, [])

  const shuffleOptions = useCallback(() => {
    if (spinning || options.length < 2) return
    setOptions((prev) => shuffleValues(prev))
    setWinnerIdx(null)
    setFeedbackMessage('Opções embaralhadas.')
  }, [options.length, spinning])

  const applyPreset = useCallback(
    (preset) => {
      if (spinning) return
      setOptions(preset.items.slice(0, MAX_OPTIONS))
      setWinnerIdx(null)
    },
    [spinning],
  )

  const spin = useCallback(() => {
    if (!canSpin) return
    setWinnerIdx(null)
    setSpinning(true)

    const total = options.length
    const segmentAngle = 360 / total
    const winIdx = Math.floor(Math.random() * total)
    const extraTurns = 5 + Math.floor(Math.random() * 3)

    const segmentCenter = winIdx * segmentAngle + segmentAngle / 2
    const targetMod = (360 - segmentCenter) % 360
    const baseRotation = Math.ceil(rotation / 360) * 360
    const finalRotation = baseRotation + extraTurns * 360 + targetMod

    setRotation(finalRotation)

    clearTimeout(spinTimer.current)
    spinTimer.current = setTimeout(() => {
      setSpinning(false)
      setWinnerIdx(winIdx)
      const chosenOption = options[winIdx]
      setHistory((prev) => [
        {
          id: Date.now(),
          value: chosenOption,
          at: new Date().toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
        ...prev,
      ].slice(0, 8))
    }, spinDuration)
  }, [canSpin, options, rotation, spinDuration])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addOption()
      }
    },
    [addOption],
  )

  const winner = winnerIdx != null ? options[winnerIdx] : null

  const copyWinner = useCallback(async () => {
    if (!winner) return
    try {
      await navigator.clipboard.writeText(winner)
      setFeedbackMessage('Resultado copiado!')
    } catch {
      setFeedbackMessage('Não foi possível copiar o resultado.')
    }
  }, [winner])

  const wheelSegments = useMemo(() => {
    if (optionCount === 0) return []
    const segAngle = 360 / optionCount
    const cx = 200
    const cy = 200
    const r = 190
    return options.map((label, i) => {
      const startAngle = i * segAngle
      const endAngle = startAngle + segAngle
      const midAngle = startAngle + segAngle / 2
      const labelRadius = optionCount <= 2 ? r * 0.5 : r * 0.62
      const labelPos = polarToCartesian(cx, cy, labelRadius, midAngle)
      let textRotation = midAngle
      if (midAngle > 90 && midAngle < 270) textRotation = midAngle + 180
      const maxChars = optionCount <= 4 ? 18 : optionCount <= 8 ? 12 : 9
      return {
        idx: i,
        label,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        d: optionCount === 1
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
          : segmentPath(cx, cy, r, startAngle, endAngle),
        labelPos,
        textRotation,
        displayLabel: truncate(label, maxChars),
      }
    })
  }, [options, optionCount])

  return (
    <div className="app">
      <Header
        optionCount={optionCount}
        canClear={optionCount > 0 && !spinning}
        onClear={clearAll}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main">
        <section className="wheel-card" aria-label="Roleta de Decisão">
          <div className="hero-copy">
            <p className="eyebrow">Decisão rápida</p>
            <h1 className="hero-title">Uma roleta mais bonita, mais clara e pronta para portfólio.</h1>
            <p className="hero-subtitle">
              Adicione suas opções, reorganize a lista quando quiser e deixe a sorte escolher com
              histórico salvo, importação flexível e um visual mais marcante.
            </p>
            <div className="hero-stats" aria-label="Resumo da sessão">
              <article className="stat-card">
                <span>Opções</span>
                <strong>{optionCount}</strong>
              </article>
              <article className="stat-card">
                <span>Histórico</span>
                <strong>{history.length}</strong>
              </article>
              <article className="stat-card">
                <span>Status</span>
                <strong>{wheelStatus}</strong>
              </article>
              <article className="stat-card">
                <span>Espaços livres</span>
                <strong>{remainingSlots}</strong>
              </article>
            </div>
          </div>

          <div className="wheel-wrap">
            <PointerIcon />
            {optionCount === 0 ? (
              <div className="wheel-empty" role="status">
                <CircleIcon className="wheel-empty-icon" />
                <div className="wheel-empty-title">Nenhuma opção ainda</div>
                <div className="wheel-empty-sub">
                  Adicione pelo menos duas opções ao lado, depois gire a roleta.
                </div>
              </div>
            ) : (
              <svg
                className="wheel-svg"
                viewBox="0 0 400 400"
                aria-label={`Roleta com ${optionCount} ${optionCount === 1 ? 'opção' : 'opções'}`}
                role="img"
              >
                <g
                  className={`wheel-rotor${spinning ? ' spinning' : ''}`}
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transitionDuration: `${spinDuration}ms`,
                  }}
                >
                  {wheelSegments.map((s) => (
                    <g key={s.idx} className={`wheel-segment${!spinning && winnerIdx === s.idx ? ' winner' : ''}`}>
                      <path d={s.d} fill={s.color} />
                      <text
                        className="wheel-label"
                        x={s.labelPos.x}
                        y={s.labelPos.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${s.textRotation} ${s.labelPos.x} ${s.labelPos.y})`}
                      >
                        {s.displayLabel}
                      </text>
                    </g>
                  ))}
                  {optionCount > 1 &&
                    wheelSegments.map((s, i) => {
                      const angle = i * (360 / optionCount)
                      const start = polarToCartesian(200, 200, 0, angle)
                      const end = polarToCartesian(200, 200, 190, angle)
                      return (
                        <line
                          key={`div-${i}`}
                          className="wheel-divider"
                          x1={start.x}
                          y1={start.y}
                          x2={end.x}
                          y2={end.y}
                        />
                      )
                    })}
                </g>
                <circle cx="200" cy="200" r="28" className="wheel-hub" />
                <circle cx="200" cy="200" r="10" className="wheel-hub-inner" />
              </svg>
            )}
          </div>

          <div className="wheel-actions">
            <button
              type="button"
              className="btn-primary spin-btn"
              onClick={spin}
              disabled={!canSpin}
              aria-label="Girar a roleta"
            >
              {spinning ? (
                <>
                  <SpinnerIcon />
                  Girando…
                </>
              ) : (
                <>
                  <SparkleIcon />
                  Girar a roleta
                </>
              )}
            </button>

            {winner ? (
              <div className="result-banner" role="status" aria-live="polite">
                <span className="result-label">Resultado</span>
                <span className="result-value">{winner}</span>
                <button type="button" className="copy-btn" onClick={copyWinner}>
                  <CopyIcon />
                  Copiar
                </button>
              </div>
            ) : (
              <span className="result-placeholder">
                {optionCount < MIN_OPTIONS_TO_SPIN
                  ? 'Adicione pelo menos duas opções para girar.'
                  : spinning
                  ? 'Escolhendo para você…'
                  : 'Gire a roleta e deixe a sorte decidir.'}
              </span>
            )}
            {feedbackMessage && !winner && <div className="feedback-pill">{feedbackMessage}</div>}
            {winner && feedbackMessage && <div className="feedback-pill">{feedbackMessage}</div>}
          </div>
        </section>

        <aside className="panel" aria-label="Painel de Opções">
          <div className="panel-section">
            <div className="section-label">
              Adicionar opção
              <span className="count-pill">
                {optionCount} / {MAX_OPTIONS}
              </span>
            </div>
            <div className="add-row">
              <input
                type="text"
                className="opt-input"
                placeholder="ex: Pizza"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={32}
                disabled={spinning || optionCount >= MAX_OPTIONS}
                aria-label="Nova opção"
              />
              <button
                type="button"
                className="btn-add"
                onClick={addOption}
                disabled={!draft.trim() || spinning || optionCount >= MAX_OPTIONS}
                aria-label="Adicionar opção"
              >
                <PlusIcon />
                Adicionar
              </button>
            </div>
            <div className="hint-row">
              <span>Importação aceita linhas e separação por ;</span>
              {optionCount >= MAX_OPTIONS && <span>Limite máximo atingido</span>}
            </div>
          </div>

          <div className="panel-section">
            <div className="section-label">Importar / Exportar</div>
            <textarea
              className="import-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Uma opção por linha ou separadas por ;"
              disabled={spinning}
            />
            <div className="action-row">
              <button type="button" className="btn-add" onClick={() => importOptions(importText)} disabled={spinning}>
                <ImportIcon />
                Importar
              </button>
              <button type="button" className="btn-add" onClick={exportOptions} disabled={spinning || optionCount === 0}>
                <ExportIcon />
                Exportar
              </button>
              <button type="button" className="btn-add" onClick={shuffleOptions} disabled={spinning || optionCount < 2}>
                <ShuffleIcon />
                Embaralhar
              </button>
            </div>
            {feedbackMessage && <div className="feedback-pill">{feedbackMessage}</div>}
          </div>

          <div className="panel-section">
            <div className="section-label">Opções</div>
            {optionCount === 0 ? (
              <div className="empty-list">Nenhuma opção. Adicione algumas ou escolha um modelo rápido abaixo.</div>
            ) : (
              <div className="options-list">
                {options.map((opt, i) => (
                  <div
                    key={`${opt}-${i}`}
                    className={`option-row${winnerIdx === i ? ' winner' : ''}`}
                  >
                    <span
                      className="option-dot"
                      style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="option-text">{opt}</span>
                    <button
                      type="button"
                      className="btn-icon danger"
                      onClick={() => removeOption(i)}
                      disabled={spinning}
                      aria-label={`Remover ${opt}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-section">
            <div className="section-label">
              Histórico
              {history.length > 0 && (
                <button type="button" className="text-link" onClick={clearHistory}>
                  Limpar
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="empty-list">Ainda não houve sorteios. Gire a roleta para criar seu histórico.</div>
            ) : (
              <ul className="history-list">
                {history.map((entry) => (
                  <li key={entry.id} className="history-item">
                    <span className="history-value">{entry.value}</span>
                    <span className="history-time">{entry.at}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel-section">
            <div className="section-label">Modelos Rápidos</div>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(p)}
                  disabled={spinning}
                  aria-label={`Usar modelo: ${p.label}`}
                >
                  <PresetIcon name={p.icon} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="credit">
        <span>Desenvolvido por Cesar Augusto</span>
      </footer>
    </div>
  )
}

/* ─── Header ─────────────────────────────────────── */
function Header({ optionCount, canClear, onClear, theme, onToggleTheme }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          <div>
            <h1 className="header-title">Roleta de Decisão</h1>
            <p className="header-sub">Gire a roleta e deixe a sorte escolher por você.</p>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="btn-ghost"
            onClick={onToggleTheme}
            aria-label="Alternar tema"
            title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClear}
            disabled={!canClear}
            aria-label="Limpar todas as opções"
          >
            <TrashIcon size={13} />
            Limpar tudo
            {optionCount > 0 && <span style={{ opacity: 0.6 }}>({optionCount})</span>}
          </button>
        </div>
      </div>
    </header>
  )
}

/* ─── Icons (inline SVG, thin-line) ──────────────── */
function PointerIcon() {
  return (
    <svg
      className="wheel-pointer"
      width="34"
      height="44"
      viewBox="0 0 34 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 40 L4 14 A14 14 0 0 1 30 14 Z"
        fill="#fafafa"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1"
      />
      <circle cx="17" cy="14" r="4" fill="#6366f1" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ animation: 'spin 0.9s linear infinite' }}>
      <path d="M12 3a9 9 0 1 0 9 9" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

function CircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 4" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 3h14" />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3h5v5" />
      <path d="M4 20 20 4" />
      <path d="M21 19v2h-2" />
      <path d="m3 3 6 6" />
      <path d="M14 14 21 21" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  )
}

function PresetIcon({ name }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (name === 'utensils')
    return (
      <svg {...common}>
        <path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v8M16 3c-2 0-3 2-3 5s1 5 3 5v7" />
      </svg>
    )
  if (name === 'check')
    return (
      <svg {...common}>
        <path d="M5 12l4 4 10-10" />
      </svg>
    )
  if (name === 'film')
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
      </svg>
    )
  if (name === 'dumbbell')
    return (
      <svg {...common}>
        <path d="M5 9v6M3 11v2M9 7v10M15 7v10M19 9v6M21 11v2M9 12h6" />
      </svg>
    )
  return null
}
