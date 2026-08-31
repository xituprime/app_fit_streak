import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { workouts, type Workout } from './db'
import { createPushUpDetector } from './poseDetector'
import type { PushUpDebug, PushUpFeedback } from './pushUpCounter'

type View = 'home' | 'workout' | 'history'
const day = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const formatDate = (value: string) => new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))

export default function App() {
  const [view, setView] = useState<View>('home')
  const [goal, setGoal] = useState(20)
  const [reps, setReps] = useState(0)
  const [history, setHistory] = useState<Workout[]>([])
  const [cameraError, setCameraError] = useState('')
  const [feedback, setFeedback] = useState<PushUpFeedback | 'Serie completada'>('Colócate de lado')
  const [debug, setDebug] = useState<PushUpDebug>({ state: 'UP', elbowAngle: null, visibility: 0, reps: 0 })
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraRequestRef = useRef(0)
  const repsRef = useRef(0)
  const savingRef = useRef(false)
  const detector = useMemo(createPushUpDetector, [])
  const refresh = async () => setHistory((await workouts.all()).sort((a, b) => b.date.localeCompare(a.date)))
  useEffect(() => { refresh() }, [])
  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setStream(null)
    detector.stop()
  }, [detector])
  const requestCamera = useCallback(async (nextFacingMode: 'user' | 'environment') => {
    // Stop every old track before requesting the next device; stale permission responses are discarded.
    stopCamera()
    const requestId = cameraRequestRef.current
    setCameraError('')
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      if (requestId !== cameraRequestRef.current) { cameraStream.getTracks().forEach(track => track.stop()); return }
      streamRef.current = cameraStream
      setFacingMode(nextFacingMode)
      setStream(cameraStream)
    } catch { setCameraError('No se pudo acceder a esta cámara. Puedes continuar con el contador manual.') }
  }, [stopCamera])
  const say = useCallback((message: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message))
  }, [])
  const finish = useCallback(async (finalReps = repsRef.current) => {
    if (savingRef.current) return
    savingRef.current = true
    stopCamera()
    if (finalReps > 0) { await workouts.add({ date: day(), reps: finalReps, goal, xp: finalReps >= goal ? 50 : Math.max(10, finalReps) }); await refresh() }
    setView('home'); savingRef.current = false
  }, [goal, stopCamera])
  const addRep = useCallback(() => {
    if (repsRef.current >= goal) return
    const next = repsRef.current + 1
    repsRef.current = next; setReps(next)
    if (next === goal || next % 5 === 0) say(next === goal ? 'Serie completada' : `${next}`)
    if (next >= goal) { setFeedback('Serie completada'); say('Serie completada. Excelente trabajo.'); window.setTimeout(() => void finish(next), 900) }
  }, [finish, goal, say])
  useEffect(() => { detector.onRep(addRep); detector.onFeedback(setFeedback); detector.onDebug(setDebug) }, [detector, addRep])
  useEffect(() => () => { detector.stop() }, [detector])
  useEffect(() => {
    if (view !== 'workout' || !stream || !videoRef.current) return
    const video = videoRef.current
    let cancelled = false
    video.srcObject = stream
    video.play().then(() => cancelled ? undefined : detector.start(video)).catch(() => setCameraError('La cámara está lista, pero no pudo iniciarse la detección. Puedes usar +1 manual.'))
    return () => { cancelled = true; detector.stop() }
  }, [view, stream, detector])

  const stats = useMemo(() => {
    const totalXp = history.reduce((sum, item) => sum + item.xp, 0)
    const dates = [...new Set(history.map(x => x.date))].sort().reverse()
    let streak = 0, cursor = new Date(); cursor.setHours(0,0,0,0)
    if (dates[0] && dates[0] !== day(cursor)) cursor.setDate(cursor.getDate() - 1)
    for (const date of dates) { if (date === day(cursor)) { streak++; cursor.setDate(cursor.getDate() - 1) } else if (date < day(cursor)) break }
    return { totalXp, streak }
  }, [history])
  const startWorkout = async () => {
    savingRef.current = false; repsRef.current = 0; setReps(0); setDebug({ state: 'UP', elbowAngle: null, visibility: 0, reps: 0 }); setFeedback('Colócate de lado'); setCameraError(''); setView('workout')
    await requestCamera(facingMode)
  }
  const removeManualRep = () => { const next = Math.max(0, repsRef.current - 1); repsRef.current = next; setReps(next) }
  if (view === 'workout') return <main className="workout"><button className="back" onClick={() => void finish()}>×</button><div className="camera"><video ref={videoRef} className={facingMode === 'user' ? 'mirrored' : ''} muted playsInline/><button className="switch-camera" onClick={() => void requestCamera(facingMode === 'user' ? 'environment' : 'user')} aria-label="Alternar cámara">↺ <span>{facingMode === 'user' ? 'Frontal' : 'Trasera'}</span></button><div className="counter overlay-counter">{reps}<span> / {goal}</span></div><div className="camera-label">POSE LANDMARKER · PROCESAMIENTO LOCAL</div></div><div className="debug-panel"><b>DEBUG</b><span>Estado: {debug.state}</span><span>Codo: {debug.elbowAngle ?? '—'}°</span><span>Visibilidad: {debug.visibility}%</span><span>Reps: {reps}</span></div><div className="feedback" aria-live="polite">{feedback}</div>{cameraError && <p className="notice">{cameraError}</p>}<div className="progress"><i style={{ width: `${Math.min(100, reps / goal * 100)}%` }}/></div><div className="controls"><button className="round" onClick={removeManualRep}>−</button><button className="rep" onClick={addRep}>+1</button><button className="round" onClick={() => void finish()}>✓</button></div><p className="hint">La cámara analiza tu postura localmente. Usa +1 solo como respaldo.</p></main>
  return <main><header><div><p className="brand">FIT STREAK</p><h1>Hola, atleta.</h1></div><div className="streak">🔥<b>{stats.streak}</b><small>días</small></div></header><section className="xp"><span>NIVEL 1</span><strong>{stats.totalXp} XP</strong><div><i style={{width: `${Math.min(100, stats.totalXp % 100)}%`}}/></div></section>{view === 'history' ? <><div className="title-row"><h2>Historial</h2><button className="link" onClick={() => setView('home')}>Hoy</button></div>{history.length ? <section className="history">{history.map(item => <article key={item.id}><div><b>{formatDate(item.date)}</b><small>Push-ups / Despechadas</small></div><strong>{item.reps}<small> reps</small></strong><em>+{item.xp} XP</em></article>)}</section> : <p className="empty">Aún no hay entrenamientos. Tu primera sesión empieza hoy.</p>}</> : <><p className="eyebrow">ENTRENAMIENTO DE HOY</p><section className="card"><div className="exercise-icon">⌁</div><p>FUERZA · PECHO</p><h2>Push-ups<br/><span>Despechadas</span></h2><label>Objetivo de repeticiones</label><div className="goals">{[10,20,30,40].map(n => <button className={goal === n ? 'selected' : ''} onClick={() => setGoal(n)} key={n}>{n}</button>)}</div><button className="primary" onClick={startWorkout}>Empezar entrenamiento <span>→</span></button></section><button className="history-button" onClick={() => setView('history')}>Ver historial <span>›</span></button></>}</main>
}
