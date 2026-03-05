import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import QAJSON from './assets/test-qa.json'

const DEFAULT_SPEED = 3

type QAContent = {
  text?: string
  imageUrl?: string
  audioUrl?: string
  audioUrl2?: string
}

type QAItem = {
  uid: string
  id: string
  question: QAContent
  answer: QAContent
  answered?: boolean
  score?: number
}

type AppState =
  | { status: 'idle'; items: QAItem[] }
  | { status: 'spinning'; items: QAItem[] }

type ModalState =
  | { open: false }
  | {
      open: true
      item: QAItem
      showAnswer: boolean
      phase: 'opening' | 'open' | 'closing'
      scorePending: boolean
      celebrationImageUrl?: string
      questionTextRevealed?: boolean
    }

const STORAGE_KEY = 'qa-wheel-state-v1'

const CELEBRATION_IMAGES = [
  '/march/random/4a28756ce973950f7c02366373243482.jpg',
  '/march/random/18d6dec5ebf789b2738f2f4fd14f4b39.jpg',
  '/march/random/46c8a2391782e90a19e2db144e9ca22c.jpg',
  '/march/random/288126332b0958a5fe76651ed73cc807.jpg',
  '/march/random/a40b30c066ae0a203837024a8d2b94b0.jpg',
  '/march/random/maxresdefaul.jpg',
  '/march/random/maxresdefaul.jpg',
  '/march/random/sadsadasd.webp',
]

const getRandomCelebrationImage = () =>
  CELEBRATION_IMAGES[Math.floor(Math.random() * CELEBRATION_IMAGES.length)]

const SPIN_SOUND_URL = `${import.meta.env.BASE_URL}Sound/role.mp3`

type PersistedState = {
  items: QAItem[]
  wheelRotationDeg: number
  lastShownUid: string | null
  spinDurationSec: number
}

const loadPersistedState = (): PersistedState | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed || !Array.isArray(parsed.items)) return null
    return {
      items: parsed.items,
      wheelRotationDeg: Number.isFinite(parsed.wheelRotationDeg)
        ? parsed.wheelRotationDeg
        : 0,
      lastShownUid:
        typeof parsed.lastShownUid === 'string' || parsed.lastShownUid === null
          ? parsed.lastShownUid
          : null,
      spinDurationSec:
        typeof parsed.spinDurationSec === 'number' && Number.isFinite(parsed.spinDurationSec)
          ? parsed.spinDurationSec
          : DEFAULT_SPEED,
    }
  } catch {
    return null
  }
}

const parseItemsFromUnknown = (raw: unknown): QAItem[] => {
  const normalize = (value: any): QAContent => {
    if (!value) return {}
    if (typeof value === 'string') {
      return { text: value }
    }
    if (typeof value === 'object') {
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
      return {
        text: str(value.text),
        imageUrl: str(value.imageUrl),
        audioUrl: str(value.audioUrl) ?? str((value as any).audio),
        audioUrl2: str(value.audioUrl2) ?? str((value as any).audio2),
      }
    }
    return {}
  }

  const parsedArray = Array.isArray(raw) ? raw : []
  return parsedArray.map((item, index) => {
    const obj = typeof item === 'object' && item !== null ? item : {}
    const q = (obj as any).question ?? (obj as any).q
    const a = (obj as any).answer ?? (obj as any).a
    const rawId = String((obj as any).id ?? index + 1)

    return {
      uid: `${rawId}::${index}`,
      id: rawId,
      question: normalize(q),
      answer: normalize(a),
    }
  })
}

function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    const persisted = loadPersistedState()
    if (persisted) {
      return { status: 'idle', items: persisted.items }
    }
    return { status: 'idle', items: parseItemsFromUnknown(QAJSON as unknown) }
  })
  const [modal, setModal] = useState<ModalState>({ open: false })
  const closeTimerRef = useRef<number | null>(null)
  const [wheelRotationDeg, setWheelRotationDeg] = useState(() => {
    const persisted = loadPersistedState()
    return persisted ? persisted.wheelRotationDeg : 0
  })
  const [lastShownUid, setLastShownUid] = useState<string | null>(() => {
    const persisted = loadPersistedState()
    return persisted ? persisted.lastShownUid : null
  })
  const [spinDurationSec, setSpinDurationSec] = useState(() => {
    const persisted = loadPersistedState()
    return persisted ? persisted.spinDurationSec : DEFAULT_SPEED
  })
  const SPIN_MS = Math.max(400, spinDurationSec * 1000)
  const MODAL_ANIM_MS = 180
  const SCORE_ANIM_MS = 500
  const [scorePulse, setScorePulse] = useState(false)
  const scorePulseTimerRef = useRef<number | null>(null)
  const pendingScorePulseRef = useRef(false)
  const pendingScoreUidRef = useRef<string | null>(null)
  const [scoreButtonPulse, setScoreButtonPulse] = useState(false)
  const scoreButtonPulseTimerRef = useRef<number | null>(null)
  const spinAudioRef = useRef<HTMLAudioElement | null>(null)

  const triggerScorePulse = () => {
    setScorePulse(false)
    // Перезапускаем анимацию даже при быстрых вызовах
    requestAnimationFrame(() => setScorePulse(true))
    if (scorePulseTimerRef.current !== null) {
      window.clearTimeout(scorePulseTimerRef.current)
    }
    scorePulseTimerRef.current = window.setTimeout(() => {
      setScorePulse(false)
      scorePulseTimerRef.current = null
    }, SCORE_ANIM_MS)
  }

  const triggerScoreButtonPulse = () => {
    setScoreButtonPulse(false)
    requestAnimationFrame(() => setScoreButtonPulse(true))
    if (scoreButtonPulseTimerRef.current !== null) {
      window.clearTimeout(scoreButtonPulseTimerRef.current)
    }
    scoreButtonPulseTimerRef.current = window.setTimeout(() => {
      setScoreButtonPulse(false)
      scoreButtonPulseTimerRef.current = null
    }, 260)
  }

  const openModal = (item: QAItem, showAnswer: boolean) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    const hasAudio = !!(item.question.audioUrl || item.question.audioUrl2)
    setModal({
      open: true,
      item,
      showAnswer,
      phase: 'opening',
      scorePending: false,
      questionTextRevealed: !hasAudio,
    })
    // Переключаем фазу в следующий кадр, чтобы сработали CSS transitions
    requestAnimationFrame(() => {
      setModal((prev) => (prev.open ? { ...prev, phase: 'open' } : prev))
    })
  }

  const closeModal = () => {
    setModal((prev) => {
      if (!prev.open) return prev
      if (prev.phase === 'closing') return prev
      return { ...prev, phase: 'closing' }
    })

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      setModal({ open: false })
      const uid = pendingScoreUidRef.current
      if (uid) {
        pendingScoreUidRef.current = null
        setAppState((prev) => {
          const items = prev.items.map((it) => (it.uid === uid ? { ...it, score: 1 } : it))
          return { ...prev, items }
        })
      }
      if (pendingScorePulseRef.current) {
        pendingScorePulseRef.current = false
        triggerScorePulse()
      }
      closeTimerRef.current = null
    }, MODAL_ANIM_MS)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const data: PersistedState = {
      items: appState.items,
      wheelRotationDeg,
      lastShownUid,
      spinDurationSec,
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // ignore quota / access errors
    }
  }, [appState.items, wheelRotationDeg, lastShownUid, spinDurationSec])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
      if (scorePulseTimerRef.current !== null) {
        window.clearTimeout(scorePulseTimerRef.current)
      }
      if (scoreButtonPulseTimerRef.current !== null) {
        window.clearTimeout(scoreButtonPulseTimerRef.current)
      }
      spinAudioRef.current?.pause()
      spinAudioRef.current = null
    }
  }, [])

  const activeItems = useMemo(
    () => appState.items.filter((it) => !it.answered),
    [appState.items],
  )

  const totalScore = useMemo(
    () => appState.items.reduce((sum, it) => sum + (it.score ?? 0), 0),
    [appState.items],
  )

  const handleSpin = () => {
    if (appState.status === 'spinning') return
    if (activeItems.length === 0) return
    if (appState.items.length === 0) return

    setAppState((prev) => ({ ...prev, status: 'spinning' }))

    if (spinAudioRef.current) {
      spinAudioRef.current.pause()
      spinAudioRef.current = null
    }
    const spinAudio = new Audio(SPIN_SOUND_URL)
    spinAudioRef.current = spinAudio
    spinAudio.play().catch(() => {})

    const winnerIndex = Math.floor(Math.random() * activeItems.length)
    const winner = activeItems[winnerIndex]

    const totalSectors = appState.items.length
    const anglePerSector = 360 / totalSectors
    const winnerGlobalIndex = appState.items.findIndex((it) => it.uid === winner.uid)

    const normalizedIndex = winnerGlobalIndex >= 0 ? winnerGlobalIndex : 0
    const winnerCenterAngle = normalizedIndex * anglePerSector + anglePerSector / 2

    // Указатель справа (на 0°). Гарантируем, что в конце:
    // (targetRotation + winnerCenterAngle) % 360 === 0
    const baseTurns = Math.floor(wheelRotationDeg / 360) * 360
    const extraSpins = 3 + Math.floor(Math.random() * 3) // 3..5 полных оборота
    const targetRotation = baseTurns + extraSpins * 360 - winnerCenterAngle
    setWheelRotationDeg(targetRotation)

    setTimeout(() => {
      if (spinAudioRef.current) {
        spinAudioRef.current.pause()
        spinAudioRef.current.currentTime = 0
        spinAudioRef.current = null
      }
      openModal(winner, false)
      setLastShownUid(winner.uid)
      setAppState((prev) => ({ ...prev, status: 'idle' }))
    }, SPIN_MS)
  }

  const handleShowAnswer = () => {
    if (!modal.open) return
    setModal((prev) => (prev.open ? { ...prev, showAnswer: true } : prev))

    // Помечаем вопрос как отвеченный
    setAppState((prev) => {
      const items = prev.items.map((it) =>
        it.uid === modal.item.uid ? { ...it, answered: true } : it,
      )
      return { ...prev, items }
    })
  }

  const handleCloseModal = () => {
    closeModal()
  }

  const handleOpenLastQuestion = () => {
    if (!lastShownUid) return
    const item = appState.items.find((it) => it.uid === lastShownUid)
    if (!item) return
    openModal(item, !!item.answered)
  }

  const handleAddScore = () => {
    if (!modal.open) return
    if (modal.item.score === 1) return
    if (modal.scorePending) return

    triggerScoreButtonPulse()
    pendingScoreUidRef.current = modal.item.uid
    setModal((prev) =>
      prev.open
        ? { ...prev, scorePending: true, celebrationImageUrl: getRandomCelebrationImage() }
        : prev,
    )
    pendingScorePulseRef.current = true
  }

  const sectors = useMemo(() => {
    if (appState.items.length === 0) return []
    return appState.items
  }, [appState.items])

  const hasData = sectors.length > 0

  const anglePerSector = sectors.length > 0 ? 360 / sectors.length : 0
  const paletteSize = sectors.length % 2 === 0 ? 2 : 3

  return (
    <div className="app">
      <header className="app-header">
        <h1>Колесо вопросов</h1>
      </header>

      <section className="controls">
        <button
          className="primary"
          type="button"
          onClick={handleSpin}
          disabled={!hasData || activeItems.length === 0 || appState.status === 'spinning'}
        >
          {appState.status === 'spinning'
            ? 'Крутим...'
            : activeItems.length === 0
              ? 'Все вопросы отвечены'
              : 'Крутить барабан'}
        </button>

        <label className="spin-duration">
          <span>Время вращения, с</span>
          <input
            type="number"
            min={0.4}
            max={10}
            step={0.1}
            value={spinDurationSec}
            onChange={(e) => {
              const next = Number.parseFloat(e.target.value)
              if (Number.isNaN(next)) {
                setSpinDurationSec(DEFAULT_SPEED)
              } else {
                setSpinDurationSec(Math.min(10, Math.max(0.4, next)))
              }
            }}
          />
        </label>

        <button
          className="primary"
          type="button"
          onClick={handleOpenLastQuestion}
          disabled={!lastShownUid}
        >
          Открыть последний вопрос
        </button>
      </section>

      <section className="score-section">
        <span className={['score-label', scorePulse ? 'score-label-pulse' : ''].join(' ')}>
          Баллы: <strong>{totalScore}</strong>
        </span>
      </section>

      <section className="wheel-section">
        {!hasData ? (
          <p className="hint">Нет вопросов в <code>src/assets/test-qa.json</code>.</p>
        ) : (
          <div className="wheel-wrapper">
            <div
              className="wheel"
              style={
                {
                  transform: `rotate(${wheelRotationDeg}deg)`,
                  '--spin-duration': `${spinDurationSec}s`,
                } as React.CSSProperties
              }
            >
              {sectors.map((item, index) => {
                const isAnswered = item.answered
                const angle = index * anglePerSector
                const skew = 90 - anglePerSector
                const colorIndex = index % paletteSize
                return (
                  <div
                    key={item.uid}
                    className={[
                      'wheel-sector',
                      `wheel-sector-color-${colorIndex}`,
                      isAnswered ? 'wheel-sector-answered' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      transform: `rotate(${angle}deg) skewY(${skew}deg)`,
                    }}
                  >
                    <div
                      className="wheel-sector-label"
                      style={{ transform: `skewY(${-skew}deg) rotate(${anglePerSector / 2}deg)` }}
                    >
                      {item.question.text || `Вопрос ${index + 1}`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {modal.open && (
        <div className="modal-backdrop" data-phase={modal.phase} onClick={handleCloseModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal.celebrationImageUrl ? (
              <>
                <h2>Бал засчитан!</h2>
                <div className="modal-celebration">
                  <img
                    src={modal.celebrationImageUrl}
                    alt="Поздравляем!"
                    className="modal-celebration-image"
                  />
                </div>
                <button className="primary" type="button" onClick={handleCloseModal}>
                  Закрыть
                </button>
              </>
            ) : (
              <>
                <h2>Вопрос</h2>

                {(modal.item.question.audioUrl || modal.item.question.audioUrl2) && (
                  <div className="modal-audio-buttons">
                    {modal.item.question.audioUrl && (
                      <button
                        className="primary primary-audio"
                        type="button"
                        onClick={() => {
                          setModal((prev) =>
                            prev.open ? { ...prev, questionTextRevealed: true } : prev,
                          )
                          const a = new Audio(modal.item.question.audioUrl)
                          a.play().catch(() => {})
                        }}
                      >
                        Вопрос от Джордана Белфорта
                      </button>
                    )}
                    {modal.item.question.audioUrl2 && (
                      <button
                        className="primary primary-audio"
                        type="button"
                        onClick={() => {
                          setModal((prev) =>
                            prev.open ? { ...prev, questionTextRevealed: true } : prev,
                          )
                          const a = new Audio(modal.item.question.audioUrl2)
                          a.play().catch(() => {})
                        }}
                      >
                        Вопрос от Геральта из Ривии
                      </button>
                    )}
                  </div>
                )}

                {modal.questionTextRevealed && (
                  <QAContentView content={modal.item.question} />
                )}

                {!modal.showAnswer && (
                  <button className="primary" type="button" onClick={handleShowAnswer}>
                    Показать ответ
                  </button>
                )}

                {modal.showAnswer && (
                  <>
                    <h3>Ответ</h3>
                    <QAContentView content={modal.item.answer} />
                    <button
                      className={[
                        'primary',
                        'bonus',
                        scoreButtonPulse ? 'score-button-pulse' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      onClick={handleAddScore}
                      disabled={modal.item.score === 1 || modal.scorePending}
                    >
                      {modal.item.score === 1 || modal.scorePending
                        ? 'Бал засчитан'
                        : 'Засчитать бал'}
                    </button>
                    <button className="primary" type="button" onClick={handleCloseModal}>
                      Закрыть
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type QAContentViewProps = {
  content: QAContent
}

function QAContentView({ content }: QAContentViewProps) {
  const { text, imageUrl } = content

  if (!text && !imageUrl) {
    return <p className="qa-empty">Нет содержимого</p>
  }

  return (
    <div className="qa-content">
      {text && <p className="qa-text">{text}</p>}
      {imageUrl && (
        <div className="qa-image-wrapper">
          <img src={imageUrl} alt="" className="qa-image" />
        </div>
      )}
    </div>
  )
}

export default App
