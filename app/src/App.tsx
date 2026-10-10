import { useEffect, useMemo, useState } from 'react'
import { DIVISIONES_TESCI, uid, validarEvidencia, type Alumno, type BloqueContenido, type Competencia, type Evidencia, type Instrumentacion, type PortafolioSeccion } from './domain/types'
import { PerfilRepo, db, type AsignaturaMeta } from './infrastructure/db'
import { optimizarImagen } from './infrastructure/imageOptimizer'
import { parsearInstrumentacion } from './infrastructure/instrumentParser'
import { descargarPDF, generarEvidenciaPDF } from './infrastructure/fo14Pdf'
import { ensamblarPortafolio } from './infrastructure/portfolioPdf'

type Tab = 'perfil' | 'materias' | 'evidencias' | 'portafolio'

const TABS: { id: Tab; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'materias', label: 'Materias' },
  { id: 'evidencias', label: 'Evidencias' },
  { id: 'portafolio', label: 'Portafolio' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('perfil')
  const [perfil, setPerfil] = useState<Alumno>(() => PerfilRepo.cargar())
  const [asignaturas, setAsignaturas] = useState<AsignaturaMeta[]>([])
  const [instrumentaciones, setInstrumentaciones] = useState<Instrumentacion[]>([])
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [instalable, setInstalable] = useState<Event | null>(null)

  useEffect(() => {
    ;(async () => {
      setAsignaturas(await db.asignaturas.toArray())
      setInstrumentaciones(await db.instrumentaciones.toArray())
      setEvidencias(await db.evidencias.toArray())
    })()
    const h = (e: Event) => { e.preventDefault(); setInstalable(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  const recargar = async () => {
    setAsignaturas(await db.asignaturas.toArray())
    setInstrumentaciones(await db.instrumentaciones.toArray())
    setEvidencias(await db.evidencias.toArray())
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <img src={`${import.meta.env.BASE_URL}membretes/tesci-header.png`} alt="TESCI" className="h-8 w-auto rounded bg-white px-1" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide">RINO DOCS</p>
            <p className="text-[11px] text-slate-400">Offline-first · FO-205P11000-14 · TESCI</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[11px] ${navigator.onLine ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {navigator.onLine ? 'En línea' : 'Sin conexión — todo local'}
            </span>
            {instalable && (
              <button
                className="touch-btn rounded-lg bg-amber-400 px-3 text-sm font-bold text-slate-950"
                onClick={async () => { const e = instalable as unknown as { prompt: () => void }; e.prompt(); setInstalable(null) }}
              >Instalar</button>
            )}
          </div>
        </div>
        <nav className="mx-auto grid max-w-5xl grid-cols-4 gap-1 px-4 pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`touch-btn rounded-xl px-2 text-sm font-semibold ${tab === t.id ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-200'}`}
            >{t.label}</button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === 'perfil' && <PerfilPanel perfil={perfil} setPerfil={setPerfil} />}
        {tab === 'materias' && <MateriasPanel asignaturas={asignaturas} instrumentaciones={instrumentaciones} recargar={recargar} />}
        {tab === 'evidencias' && <EvidenciasPanel perfil={perfil} asignaturas={asignaturas} instrumentaciones={instrumentaciones} evidencias={evidencias} recargar={recargar} />}
        {tab === 'portafolio' && <PortafolioPanel asignaturas={asignaturas} instrumentaciones={instrumentaciones} evidencias={evidencias} />}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-[11px] text-slate-500">
        100% cliente · IndexedDB + LocalStorage · sin servidores · v1.0
      </footer>
    </div>
  )
}

// ---------- Módulo 1: Perfil ----------
function PerfilPanel({ perfil, setPerfil }: { perfil: Alumno; setPerfil: (p: Alumno) => void }) {
  const guardar = () => { PerfilRepo.guardar(perfil); alert('Perfil guardado localmente') }
  const campo = 'w-full touch-btn rounded-xl border border-white/10 bg-white/5 px-3 text-slate-100'
  return (
    <section className="reveal rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-lg font-bold">Perfil del estudiante</h2>
      <p className="mb-4 text-sm text-slate-400">Se hereda en todos los membretes FO-205P11000-14.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Nombre completo
          <input className={campo} value={perfil.nombreCompleto} onChange={(e) => setPerfil({ ...perfil, nombreCompleto: e.target.value })} placeholder="Apellidos Nombres" />
        </label>
        <label className="grid gap-1 text-sm">Número de control
          <input className={campo} value={perfil.numeroControl} onChange={(e) => setPerfil({ ...perfil, numeroControl: e.target.value })} placeholder="E22670001" />
        </label>
        <label className="grid gap-1 text-sm">División (1)
          <select className={campo} value={perfil.division} onChange={(e) => setPerfil({ ...perfil, division: e.target.value })}>
            {DIVISIONES_TESCI.map((d) => <option key={d} value={d} className="text-slate-900">{d}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Grupo (2)
          <input className={campo} value={perfil.grupo} onChange={(e) => setPerfil({ ...perfil, grupo: e.target.value })} placeholder="1011V" />
        </label>
      </div>
      <button onClick={guardar} className="touch-btn mt-4 rounded-xl bg-sky-500 px-5 font-bold text-slate-950">Guardar local</button>
    </section>
  )
}

// ---------- Módulo 2: Materias + Instrumentación ----------
function MateriasPanel({ asignaturas, instrumentaciones, recargar }: { asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; recargar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [docente, setDocente] = useState('')
  const [grupo, setGrupo] = useState('')
  const [periodo, setPeriodo] = useState('2026-2')
  const [msg, setMsg] = useState('')
  const [editando, setEditando] = useState<Instrumentacion | null>(null)

  const crear = async () => {
    if (!nombre.trim()) return alert('Nombre de asignatura requerido')
    await db.asignaturas.add({ id: uid(), nombre: nombre.trim(), docente: docente.trim(), grupo: grupo.trim(), periodo: periodo.trim(), creadaEn: Date.now() })
    setNombre(''); setDocente(''); setGrupo('')
    recargar()
  }

  const subir = async (asigId: string, f: File) => {
    setMsg(`Procesando ${f.name}… (puede tardar, es a fondo para máxima calidad)`)
    try {
      const { instrumentacion } = await parsearInstrumentacion(f, setMsg)
      await db.instrumentaciones.put(instrumentacion)
      await db.asignaturas.update(asigId, { instrumentacionId: instrumentacion.id, nombre: instrumentacion.asignatura || undefined, docente: instrumentacion.docente || undefined, grupo: instrumentacion.grupo || undefined, periodo: instrumentacion.periodo || undefined })
      setMsg(`Listo: ${instrumentacion.competencias.length} competencias, confianza ${Math.round(instrumentacion.parseConfianza * 100)}%${instrumentacion.necesitaRevision ? ' — revisa/edita abajo' : ''}`)
      setEditando(instrumentacion)
      recargar()
    } catch (e) {
      setMsg(`Error al parsear: ${(e as Error).message}`)
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-lg font-bold">Asignaturas e instrumentaciones FO-205P11000-44</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cálculo Diferencial" className="touch-btn rounded-xl border border-white/10 bg-white/5 px-3" />
          <input value={docente} onChange={(e) => setDocente(e.target.value)} placeholder="Docente" className="touch-btn rounded-xl border border-white/10 bg-white/5 px-3" />
          <input value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="1011V" className="touch-btn rounded-xl border border-white/10 bg-white/5 px-3" />
          <input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-2" className="touch-btn rounded-xl border border-white/10 bg-white/5 px-3" />
        </div>
        <button onClick={crear} className="touch-btn mt-3 rounded-xl bg-sky-500 px-5 font-bold text-slate-950">Agregar materia</button>
        {msg && <p className="mt-2 text-sm text-amber-200">{msg}</p>}
      </section>

      {asignaturas.map((a) => {
        const inst = instrumentaciones.find((i) => i.id === a.instrumentacionId)
        return (
          <section key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="font-bold">{a.nombre}</p>
                <p className="text-xs text-slate-400">{a.docente} · {a.grupo} · {a.periodo}</p>
              </div>
              <label className="touch-btn ml-auto cursor-pointer rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold">
                Subir .docx / .pdf
                <input type="file" accept=".docx,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(a.id, f); e.target.value = '' }} />
              </label>
              <button className="touch-btn rounded-xl bg-white/5 px-3 text-sm" onClick={() => { if (confirm('¿Eliminar materia?')) db.asignaturas.delete(a.id).then(recargar) }}>Eliminar</button>
            </div>
            {inst ? (
              <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm">
                <p className="font-semibold text-emerald-200">{inst.originalNombre} · {inst.competencias.length} competencias · {inst.originalOrientacion}</p>
                {inst.necesitaRevision && <p className="text-amber-200">Confianza {Math.round(inst.parseConfianza * 100)}% — valida o edita antes de usar.</p>}
                <div className="mt-2 grid gap-2">
                  {inst.competencias.map((c, i) => (
                    <details key={i} className="rounded-lg bg-black/20 p-2">
                      <summary className="cursor-pointer font-semibold">Comp. {c.numero} — {c.descripcion.slice(0, 90)}</summary>
                      <p className="mt-1 text-slate-300">{c.descripcion}</p>
                      <p className="mt-1 text-xs text-slate-400">Temas: {c.temas.slice(0, 4).join(' · ')}</p>
                      <p className="text-xs text-slate-400">Indicadores: {c.indicadores.map((x) => `${x.letra}) ${x.descripcion}`).join(' · ')}</p>
                    </details>
                  ))}
                </div>
                <button onClick={() => setEditando(inst)} className="touch-btn mt-2 rounded-xl bg-amber-400 px-4 font-bold text-slate-950">Validar / editar</button>
              </div>
            ) : <p className="mt-2 text-sm text-slate-400">Sin instrumentación cargada.</p>}
          </section>
        )
      })}

      {editando && <EditorInstrumentacion inst={editando} cerrar={() => { setEditando(null); recargar() }} />}
    </div>
  )
}

function EditorInstrumentacion({ inst, cerrar }: { inst: Instrumentacion; cerrar: () => void }) {
  const [draft, setDraft] = useState<Instrumentacion>(inst)
  const setComp = (idx: number, c: Competencia) => {
    const competencias = draft.competencias.map((x, i) => (i === idx ? c : x))
    setDraft({ ...draft, competencias })
  }
  const guardar = async () => {
    await db.instrumentaciones.put({ ...draft, necesitaRevision: false, parseConfianza: 1 })
    cerrar()
  }
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/70 p-4">
      <div className="mx-auto max-w-3xl rounded-2xl bg-slate-900 p-4">
        <h3 className="text-lg font-bold">Validar instrumentación — {draft.asignatura}</h3>
        <p className="text-sm text-slate-400">Fallback manual: corrige lo que el parser no detectó.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {(['asignatura', 'docente', 'grupo', 'periodo', 'division'] as const).map((k) => (
            <label key={k} className="grid gap-1 text-sm capitalize">{k}
              <input value={(draft[k] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="touch-btn rounded-xl border border-white/10 bg-white/5 px-3" />
            </label>
          ))}
        </div>
        {draft.competencias.map((c, i) => (
          <div key={i} className="mt-3 rounded-xl border border-white/10 p-3">
            <div className="flex gap-2">
              <input value={c.numero} onChange={(e) => setComp(i, { ...c, numero: e.target.value })} className="touch-btn w-24 rounded-lg border border-white/10 bg-white/5 px-2" title="Número" />
              <button className="touch-btn rounded-lg bg-white/10 px-3 text-sm" onClick={() => setDraft({ ...draft, competencias: draft.competencias.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
            <textarea value={c.descripcion} onChange={(e) => setComp(i, { ...c, descripcion: e.target.value })} rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-2 text-sm" />
            <textarea value={c.temas.join('\n')} onChange={(e) => setComp(i, { ...c, temas: e.target.value.split('\n') })} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-2 text-sm" placeholder="Un tema por línea" />
            <textarea value={c.indicadores.map((x) => `${x.letra}) ${x.descripcion} | ${x.valor ?? ''}`).join('\n')} onChange={(e) => setComp(i, { ...c, indicadores: e.target.value.split('\n').filter(Boolean).map((l) => { const m = l.match(/^\s*([A-Z])\)\s*(.*?)(?:\|\s*(\d+))?\s*$/); return { letra: m?.[1] ?? '?', descripcion: m?.[2] ?? l, valor: m?.[3] ? parseInt(m[3]) : null } }) })} rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-2 text-sm" placeholder="A) descripción | 15" />
          </div>
        ))}
        <div className="mt-3 flex gap-2">
          <button onClick={() => setDraft({ ...draft, competencias: [...draft.competencias, { numero: String(draft.competencias.length + 1), descripcion: '', temas: [], indicadores: [], evidenciasSugeridas: [] }] })} className="touch-btn rounded-xl bg-white/10 px-4">+ Competencia</button>
          <button onClick={guardar} className="touch-btn rounded-xl bg-emerald-400 px-5 font-bold text-slate-950">Guardar validado</button>
          <button onClick={cerrar} className="touch-btn rounded-xl bg-white/5 px-4">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Módulo 3: Evidencias ----------
function EvidenciasPanel({ perfil, asignaturas, instrumentaciones, evidencias, recargar }: {
  perfil: Alumno; asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; evidencias: Evidencia[]; recargar: () => void
}) {
  const [asigId, setAsigId] = useState(asignaturas[0]?.id ?? '')
  useEffect(() => { if (!asigId && asignaturas[0]) setAsigId(asignaturas[0].id) }, [asignaturas, asigId])
  const asig = asignaturas.find((a) => a.id === asigId)
  const inst = instrumentaciones.find((i) => i.id === asig?.instrumentacionId)
  const [ev, setEv] = useState<Evidencia>(() => nuevaEvidencia(perfil))
  const [estado, setEstado] = useState('')

  useEffect(() => {
    if (asig) setEv((p) => ({ ...p, asignaturaId: asig.id, asignatura: asig.nombre, docente: asig.docente || p.docente, grupo: asig.grupo || perfil.grupo, division: perfil.division, alumnoNombre: perfil.nombreCompleto, numeroControl: perfil.numeroControl }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asigId])

  const compSel = inst?.competencias.find((c) => c.numero === ev.competenciaNo)
  const errores = useMemo(() => validarEvidencia(ev), [ev])

  const elegirCompetencia = (numero: string) => {
    const c = inst?.competencias.find((x) => x.numero === numero)
    setEv((p) => ({ ...p, competenciaNo: numero, descripcionCompetencia: c?.descripcion ?? p.descripcionCompetencia, indicadoresSeleccionados: c ? c.indicadores.map((x) => x.letra) : p.indicadoresSeleccionados }))
  }

  const addBloque = (b: BloqueContenido) => setEv((p) => ({ ...p, bloques: [...p.bloques, b], actualizadaEn: Date.now() }))
  const mover = (i: number, d: -1 | 1) => setEv((p) => {
    const arr = [...p.bloques]; const j = i + d
    if (j < 0 || j >= arr.length) return p
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...p, bloques: arr }
  })

  const subirImagen = async (f: File) => {
    setEstado('Optimizando imagen…')
    const opt = await optimizarImagen(f)
    addBloque({ id: uid(), tipo: 'imagen', dataUrl: opt.dataUrl, anchoOriginal: opt.ancho, altoOriginal: opt.alto })
    setEstado(`Imagen ${(opt.bytesAprox / 1024).toFixed(0)}KB · ${opt.ancho}x${opt.alto} — calidad preservada`)
  }

  const guardar = async () => {
    if (errores.length) return alert('Faltan campos:\n' + errores.join('\n'))
    await db.evidencias.put({ ...ev, id: ev.id || uid(), creadaEn: ev.creadaEn || Date.now(), actualizadaEn: Date.now() })
    setEstado('Evidencia guardada localmente')
    setEv(nuevaEvidencia(perfil))
    recargar()
  }

  const exportar = async (e: Evidencia) => {
    const errs = validarEvidencia(e)
    if (errs.length) return alert('No se puede exportar:\n' + errs.join('\n'))
    setEstado('Generando PDF réplica exacta…')
    const bytes = await generarEvidenciaPDF(e)
    descargarPDF(bytes, `FO-205P11000-14_${e.nombreEvidencia.slice(0, 30)}_${e.numeroControl}`)
    setEstado('PDF descargado al celular')
  }

  const campo = 'w-full touch-btn rounded-xl border border-white/10 bg-white/5 px-3'
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-lg font-bold">Creador de evidencias FO-205P11000-14</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Materia
            <select value={asigId} onChange={(e) => setAsigId(e.target.value)} className={campo}>
              {asignaturas.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Fecha de entrega (6)
            <input value={ev.fechaEntrega} onChange={(e) => setEv({ ...ev, fechaEntrega: e.target.value })} className={campo} />
          </label>
          <label className="grid gap-1 text-sm">Competencia No. (7) — selector rápido
            <select value={ev.competenciaNo} onChange={(e) => elegirCompetencia(e.target.value)} className={campo}>
              <option value="" className="text-slate-900">— elegir —</option>
              {(inst?.competencias ?? []).map((c) => <option key={c.numero} value={c.numero} className="text-slate-900">{c.numero} — {c.descripcion.slice(0, 60)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Evidencia de aprendizaje (10)
            <input value={ev.nombreEvidencia} onChange={(e) => setEv({ ...ev, nombreEvidencia: e.target.value })} placeholder="Ej. Práctica 3: límites laterales" className={campo} />
          </label>
        </div>
        <label className="mt-2 grid gap-1 text-sm">Descripción (8) — se carga sola
          <textarea value={ev.descripcionCompetencia} onChange={(e) => setEv({ ...ev, descripcionCompetencia: e.target.value })} rows={2} className="w-full rounded-xl border border-white/10 bg-white/5 p-2" />
        </label>
        <div className="mt-2 text-sm">
          <p className="mb-1 font-semibold">Indicador de alcance (9)</p>
          <div className="flex flex-wrap gap-2">
            {(compSel?.indicadores ?? [{ letra: 'A', descripcion: 'Indicador A' }, { letra: 'B', descripcion: 'Indicador B' }, { letra: 'C', descripcion: 'Indicador C' }, { letra: 'D', descripcion: 'Indicador D' }, { letra: 'E', descripcion: 'Indicador E' }, { letra: 'F', descripcion: 'Indicador F' }]).map((ind) => (
              <label key={ind.letra} className={`touch-btn flex cursor-pointer items-center gap-2 rounded-xl border px-3 ${ev.indicadoresSeleccionados.includes(ind.letra) ? 'border-sky-400 bg-sky-400/15' : 'border-white/10 bg-white/5'}`} title={ind.descripcion}>
                <input type="checkbox" className="h-5 w-5" checked={ev.indicadoresSeleccionados.includes(ind.letra)} onChange={() => setEv((p) => ({ ...p, indicadoresSeleccionados: p.indicadoresSeleccionados.includes(ind.letra) ? p.indicadoresSeleccionados.filter((x) => x !== ind.letra) : [...p.indicadoresSeleccionados, ind.letra] }))} />
                <span className="font-bold">{ind.letra}</span>
                <span className="max-w-44 truncate text-xs text-slate-300">{ind.descripcion}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 p-3">
          <p className="font-semibold">Bloques de contenido</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => addBloque({ id: uid(), tipo: 'texto', texto: '' })} className="touch-btn rounded-lg bg-white/10 px-3 text-sm">+ Texto</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'codigo', lenguaje: 'python', texto: '# código' })} className="touch-btn rounded-lg bg-white/10 px-3 text-sm">+ Código</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'tabla', encabezados: ['Col 1', 'Col 2'], filas: [['', '']] })} className="touch-btn rounded-lg bg-white/10 px-3 text-sm">+ Tabla</button>
            <label className="touch-btn cursor-pointer rounded-lg bg-white/10 px-3 py-3 text-sm">+ Imagen
              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await subirImagen(f); e.target.value = '' }} />
            </label>
            <button onClick={() => addBloque({ id: uid(), tipo: 'referencia', texto: '' })} className="touch-btn rounded-lg bg-white/10 px-3 text-sm">+ Referencia APA</button>
          </div>
          <div className="mt-2 grid gap-2">
            {ev.bloques.map((b, i) => (
              <div key={b.id} className="rounded-xl bg-black/25 p-2">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-bold uppercase">{b.tipo}</span>
                  <button onClick={() => mover(i, -1)} className="touch-btn rounded bg-white/10 px-2">↑</button>
                  <button onClick={() => mover(i, 1)} className="touch-btn rounded bg-white/10 px-2">↓</button>
                  <button onClick={() => setEv((p) => ({ ...p, bloques: p.bloques.filter((x) => x.id !== b.id) }))} className="touch-btn ml-auto rounded bg-red-500/20 px-2 text-red-200">Quitar</button>
                </div>
                {b.tipo === 'texto' && <textarea value={b.texto} onChange={(e) => setEv((p) => ({ ...p, bloques: p.bloques.map((x) => (x.id === b.id ? { ...x, texto: e.target.value } : x)) }))} rows={3} className="w-full rounded-lg bg-white/5 p-2 text-sm" placeholder="Desarrollo de la evidencia…" />}
                {b.tipo === 'codigo' && <textarea value={b.texto} onChange={(e) => setEv((p) => ({ ...p, bloques: p.bloques.map((x) => (x.id === b.id && x.tipo === 'codigo' ? { ...x, texto: e.target.value } : x)) }))} rows={4} className="w-full rounded-lg bg-black p-2 font-mono text-sm text-emerald-200" />}
                {b.tipo === 'tabla' && <TablaEditor b={b} onChange={(nb) => setEv((p) => ({ ...p, bloques: p.bloques.map((x) => (x.id === b.id ? nb : x)) }))} />}
                {b.tipo === 'imagen' && <img src={b.dataUrl} alt={b.pie ?? ''} className="max-h-64 rounded-lg" />}
                {b.tipo === 'referencia' && <input value={b.texto} onChange={(e) => setEv((p) => ({ ...p, bloques: p.bloques.map((x) => (x.id === b.id && x.tipo === 'referencia' ? { ...x, texto: e.target.value } : x)) }))} placeholder="Autor (año). Título. URL" className="w-full rounded-lg bg-white/5 p-2 text-sm" />}
              </div>
            ))}
          </div>
        </div>

        {errores.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-amber-200">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={guardar} className="touch-btn rounded-xl bg-white/10 px-5 font-semibold">Guardar</button>
          <button onClick={() => exportar(ev)} className="touch-btn rounded-xl bg-emerald-400 px-5 font-bold text-slate-950">Descargar PDF a celular</button>
        </div>
        {estado && <p className="mt-2 text-sm text-sky-200">{estado}</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="font-bold">Mis evidencias ({evidencias.filter((e) => e.asignaturaId === asigId).length})</h3>
        {evidencias.filter((e) => e.asignaturaId === asigId).map((e) => (
          <div key={e.id} className="mt-2 flex items-center gap-2 rounded-xl bg-black/20 p-2 text-sm">
            <div><p className="font-semibold">{e.nombreEvidencia || '(sin nombre)'} · Comp. {e.competenciaNo}</p>
              <p className="text-xs text-slate-400">{e.bloques.length} bloques · [{e.indicadoresSeleccionados.join(',')}]</p></div>
            <button onClick={() => exportar(e)} className="touch-btn ml-auto rounded-lg bg-emerald-400 px-3 font-bold text-slate-950">PDF</button>
            <button onClick={() => setEv(e)} className="touch-btn rounded-lg bg-white/10 px-3">Editar</button>
          </div>
        ))}
      </section>
    </div>
  )
}

function TablaEditor({ b, onChange }: { b: Extract<BloqueContenido, { tipo: 'tabla' }>; onChange: (n: Extract<BloqueContenido, { tipo: 'tabla' }>) => void }) {
  return (
    <div className="grid gap-1 text-sm">
      <input value={b.encabezados.join(' | ')} onChange={(e) => onChange({ ...b, encabezados: e.target.value.split('|').map((s) => s.trim()) })} className="rounded-lg bg-white/5 p-2" placeholder="Encabezados separados por |" />
      {b.filas.map((f, i) => (
        <input key={i} value={f.join(' | ')} onChange={(e) => { const filas = b.filas.map((r, j) => (j === i ? e.target.value.split('|').map((s) => s.trim()) : r)); onChange({ ...b, filas }) }} className="rounded-lg bg-white/5 p-2" placeholder="Fila separada por |" />
      ))}
      <button onClick={() => onChange({ ...b, filas: [...b.filas, ['']] })} className="touch-btn rounded-lg bg-white/10 px-3">+ Fila</button>
    </div>
  )
}

function nuevaEvidencia(perfil: Alumno): Evidencia {
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  return {
    id: '', asignaturaId: '', division: perfil.division, grupo: perfil.grupo,
    asignatura: '', docente: '', alumnoNombre: perfil.nombreCompleto, numeroControl: perfil.numeroControl,
    fechaEntrega: hoy, competenciaNo: '', descripcionCompetencia: '',
    indicadoresSeleccionados: [], nombreEvidencia: '', bloques: [],
    creadaEn: 0, actualizadaEn: 0,
  }
}

// ---------- Módulo 4: Portafolio ----------
function PortafolioPanel({ asignaturas, instrumentaciones, evidencias }: { asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; evidencias: Evidencia[] }) {
  const [asigId, setAsigId] = useState(asignaturas[0]?.id ?? '')
  const asig = asignaturas.find((a) => a.id === asigId)
  const inst = instrumentaciones.find((i) => i.id === asig?.instrumentacionId)
  const evs = evidencias.filter((e) => e.asignaturaId === asigId)
  const [secciones, setSecciones] = useState<PortafolioSeccion[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setSecciones([
      { id: uid(), tipo: 'portada', titulo: 'Portada general del portafolio' },
      { id: uid(), tipo: 'indice', titulo: 'Índice de contenido' },
      ...(inst ? [{ id: uid(), tipo: 'instrumentacion' as const, titulo: `Instrumentación original (${inst.originalNombre})` }] : []),
      ...(inst?.competencias.flatMap((c) => [
        { id: uid(), tipo: 'portada-competencia' as const, titulo: `Portada competencia ${c.numero}`, refId: c.numero },
        ...evs.filter((e) => e.competenciaNo === c.numero).map((e) => ({ id: uid(), tipo: 'evidencia' as const, titulo: e.nombreEvidencia, refId: e.id })),
      ]) ?? []),
      ...evs.filter((e) => !inst?.competencias.some((c) => c.numero === e.competenciaNo)).map((e) => ({ id: uid(), tipo: 'evidencia' as const, titulo: e.nombreEvidencia, refId: e.id })),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asigId])

  const mover = (i: number, d: number) => setSecciones((s) => {
    const a = [...s]; const j = i + d
    if (j < 0 || j >= a.length) return s
    ;[a[i], a[j]] = [a[j], a[i]]
    return a
  })

  const generar = async () => {
    if (!asig) return alert('Elige materia')
    setMsg('Ensamblando portafolio…')
    const bytes = await ensamblarPortafolio(
      { id: uid(), asignaturaId: asigId, titulo: `Portafolio ${asig.nombre}`, secciones, creadaEn: Date.now() },
      evs, inst ?? null,
      { asignatura: asig.nombre, alumno: `${asigId ? evs[0]?.alumnoNombre ?? '' : ''}`, docente: asig.docente, grupo: asig.grupo, periodo: asig.periodo },
      setMsg,
    )
    descargarPDF(bytes, `Portafolio_${asig.nombre.slice(0, 25)}`)
    await db.portafolios.put({ id: uid(), asignaturaId: asigId, titulo: `Portafolio ${asig.nombre}`, secciones, creadaEn: Date.now() })
    setMsg('Portafolio descargado + guardado local')
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-lg font-bold">Ensamblador de portafolios</h2>
      <select value={asigId} onChange={(e) => setAsigId(e.target.value)} className="touch-btn mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3">
        {asignaturas.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.nombre}</option>)}
      </select>
      <p className="mt-2 text-sm text-slate-400">Arrastra o usa ↑↓ para decidir el orden de cada sección.</p>
      <div className="mt-2 grid gap-2">
        {secciones.map((s, i) => (
          <div
            key={s.id} draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const from = parseInt(e.dataTransfer.getData('text/plain')); if (!isNaN(from)) setSecciones((arr) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(i, 0, x); return a }) }}
            className="flex cursor-grab items-center gap-2 rounded-xl bg-black/25 p-2 text-sm active:cursor-grabbing"
          >
            <span className="rounded bg-white/10 px-2 py-1 text-xs font-bold uppercase">{s.tipo}</span>
            <span className="truncate">{s.titulo}</span>
            <span className="ml-auto flex gap-1">
              <button onClick={() => mover(i, -1)} className="touch-btn rounded bg-white/10 px-2">↑</button>
              <button onClick={() => mover(i, 1)} className="touch-btn rounded bg-white/10 px-2">↓</button>
            </span>
          </div>
        ))}
      </div>
      <button onClick={generar} className="touch-btn mt-3 rounded-xl bg-emerald-400 px-5 font-bold text-slate-950">Generar portafolio PDF</button>
      {msg && <p className="mt-2 text-sm text-sky-200">{msg}</p>}
      {!inst && <p className="mt-2 text-sm text-amber-200">Sin instrumentación: súbela en Materias para incrustar el .docx/.pdf original.</p>}
    </section>
  )
}
