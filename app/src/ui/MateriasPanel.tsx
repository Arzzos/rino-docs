import { useEffect, useState } from 'react'
import { formatearIndicadores, parsearIndicadoresTexto, uid, type Competencia, type Diagnostica, type IndicadorAlcance, type Instrumentacion } from '../domain/types'
import { db, type AsignaturaMeta } from '../infrastructure/db'
import { optimizarImagen } from '../infrastructure/imageOptimizer'
import { parsearInstrumentacion, base64ABytes } from '../infrastructure/instrumentParser'
import { preRenderInstrumentacion } from '../infrastructure/docxFullRender'
import PreviewModal from './PreviewModal'
import ConfirmDialog from './ConfirmDialog'
import Icon from './icons'

export const campo = 'w-full touch-btn rounded-xl t-field px-3'
export const btnPri = 'touch-btn rounded-xl px-5 font-bold t-btn-pri'
export const btnSec = 'touch-btn rounded-xl t-surface2 t-hover px-4 font-semibold'

export default function MateriasPanel({ asignaturas, instrumentaciones, diagnosticas, recargar }: {
  asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; diagnosticas: Diagnostica[]; recargar: () => void
}) {
  const [msg, setMsg] = useState('')
  const [editando, setEditando] = useState<Instrumentacion | null>(null)
  const [preAlta, setPreAlta] = useState<Instrumentacion | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<Uint8Array | null>(null)
  const [fallaManual, setFallaManual] = useState(false)
  const [nombreManual, setNombreManual] = useState('')
  const [eliminarId, setEliminarId] = useState<string | null>(null)

  /** Alta: solo se sube la instrumentación; los datos salen de ella. */
  const subirNueva = async (f: File) => {
    setMsg(`Procesando ${f.name}…`)
    setFallaManual(false)
    try {
      const { instrumentacion } = await parsearInstrumentacion(f, setMsg)
      // Convierte el DOCX a PDF una vez; el portafolio copia páginas.
      if (!instrumentacion.originalMime.includes('pdf')) {
        setMsg('Generando vista PDF de la instrumentación…')
        const pre = await preRenderInstrumentacion(instrumentacion.originalBytesBase64, setMsg)
        instrumentacion.pdfBytesBase64 = pre.pdfBase64
        instrumentacion.pdfPaginas = pre.paginas
      }
      setMsg('')
      setPreAlta(instrumentacion) // el usuario confirma en el modal antes de crear
    } catch (e) {
      setMsg(`No se pudo leer el archivo: ${(e as Error).message}`)
      setFallaManual(true)
    }
  }

  const crearManual = async () => {
    if (!nombreManual.trim()) { setMsg('Escribe el nombre de la materia.'); return }
    await db.asignaturas.add({ id: uid(), nombre: nombreManual.trim(), docente: '', grupo: '', periodo: '', creadaEn: Date.now() })
    setNombreManual('')
    setFallaManual(false)
    recargar()
  }

  const confirmarPreAlta = async (inst: Instrumentacion) => {
    await db.instrumentaciones.put(inst)
    await db.asignaturas.add({
      id: uid(), nombre: inst.asignatura, docente: inst.docente,
      grupo: inst.grupo, periodo: inst.periodo,
      instrumentacionId: inst.id, creadaEn: Date.now(),
    })
    setPreAlta(null)
    setMsg(`Materia creada: ${inst.asignatura} · ${inst.competencias.length} competencias.`)
    recargar()
  }

  const subir = async (asigId: string, f: File) => {
    setMsg(`Procesando ${f.name}…`)
    try {
      const { instrumentacion } = await parsearInstrumentacion(f, setMsg)
      if (!instrumentacion.originalMime.includes('pdf')) {
        setMsg('Generando vista PDF de la instrumentación…')
        const pre = await preRenderInstrumentacion(instrumentacion.originalBytesBase64, setMsg)
        instrumentacion.pdfBytesBase64 = pre.pdfBase64
        instrumentacion.pdfPaginas = pre.paginas
      }
      await db.instrumentaciones.put(instrumentacion)
      await db.asignaturas.update(asigId, {
        instrumentacionId: instrumentacion.id,
        nombre: instrumentacion.asignatura || undefined,
        docente: instrumentacion.docente || undefined,
        grupo: instrumentacion.grupo || undefined,
        periodo: instrumentacion.periodo || undefined,
      })
      setMsg(`Listo: ${instrumentacion.competencias.length} competencias${instrumentacion.necesitaRevision ? ' — revísala abajo' : ''}`)
      setEditando(instrumentacion)
      recargar()
    } catch (e) {
      setMsg(`No se pudo leer el archivo: ${(e as Error).message}`)
    }
  }

  return (
    <div className="anim grid gap-4">
      <section className="card p-4 md:p-6">
        <p className="overline">Paso 1 — Base del portafolio</p>
        <h2 className="display mt-1 text-3xl font-bold">Materias</h2>
        <p className="mt-1 text-sm t-muted">Sube la instrumentación de tu materia para comenzar. Se recomienda en DOCX: conserva estructura y metadatos.</p>
        <label className={`${btnPri} mt-4 inline-flex cursor-pointer items-center gap-2`}>
          <Icon name="upload" size={16} /> Agregar materia desde instrumentación
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirNueva(f); e.target.value = '' }} />
        </label>
        {msg && <p role="status" className="mt-2 text-sm font-semibold text-[var(--accent)]">{msg}</p>}
        {asignaturas.length === 0 && (
          <p className="mt-2 text-sm t-muted">Después: crea evidencias y arma el portafolio en sus pestañas.</p>
        )}
        {fallaManual && (
          <div className="aviso aviso-warn mt-2 flex flex-wrap items-center gap-2">
            <span className="t-muted">Si el archivo es ilegible:</span>
            <input value={nombreManual} onChange={(e) => setNombreManual(e.target.value)} placeholder="Nombre de la materia" className={`${campo} flex-1`} />
            <button onClick={crearManual} className={btnSec}>Crear vacía</button>
          </div>
        )}
      </section>

      {asignaturas.map((a) => {
        const inst = instrumentaciones.find((i) => i.id === a.instrumentacionId)
        const diags = diagnosticas.filter((d) => d.asignaturaId === a.id)
        return (
          <section key={a.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b t-line p-4">
              <div className="min-w-0 flex-1">
                <p className="overline">Materia</p>
                <p className="display truncate text-xl font-bold">{a.nombre}</p>
                <p className="text-xs t-muted">{[a.docente, a.grupo, a.periodo].filter(Boolean).join(' · ') || 'Sin datos — súbelos desde la instrumentación'}</p>
              </div>
              {inst && (inst.necesitaRevision
                ? <span className="insignia insignia-warn shrink-0">Revisar</span>
                : <span className="insignia insignia-ok shrink-0">{inst.competencias.length} comp.</span>)}
              <label className={`${btnSec} flex cursor-pointer items-center gap-1 text-sm`}>
                <Icon name="upload" size={15} /> Subir .docx / PDF
                <input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(a.id, f); e.target.value = '' }} />
              </label>
              <button className="touch-btn flex items-center gap-1 rounded-xl t-surface px-3 text-sm" onClick={() => setEliminarId(a.id)} aria-label={`Eliminar ${a.nombre}`}><Icon name="trash" size={14} /> Eliminar</button>
              {inst?.pdfBytesBase64 && (
                <button className="touch-btn flex items-center gap-1 rounded-xl t-surface px-3 text-sm" onClick={() => inst?.pdfBytesBase64 && setVistaPrevia(base64ABytes(inst.pdfBytesBase64))} title="Ver el PDF tal como irá en el portafolio">
                  <Icon name="eye" size={14} /> Vista previa
                </button>
              )}
            </div>
            <div className="p-4">
            {inst ? (
              <div className="aviso aviso-ok">
                <p className="font-semibold">{inst.originalNombre} · {inst.competencias.length} competencias · {inst.originalOrientacion}</p>
                {inst.necesitaRevision && <p className="font-semibold text-[var(--warn-bg)]">Revisa los datos detectados.</p>}
                <div className="mt-2 grid gap-2">
                  {inst.competencias.map((c, i) => (
                    <details key={i} className="rounded-lg t-inset p-2">
                      <summary className="cursor-pointer font-semibold">Comp. {c.numero} — {c.descripcion.slice(0, 90)}</summary>
                      <p className="mt-1 t-muted">{c.descripcion}</p>
                      <p className="mt-1 text-xs t-muted">Indicadores: {c.indicadores.map((x) => x.letra).join(' ')}</p>
                    </details>
                  ))}
                </div>
                <button onClick={() => setEditando(inst)} className="touch-btn mt-2 flex items-center gap-1 rounded-xl bg-[var(--warn-bg)] px-4 font-bold text-[var(--warn-ink)]"><Icon name="check" size={15} /> Validar / editar</button>
              </div>
            ) : <p className="text-sm t-muted">Sin instrumentación cargada.</p>}
            <DiagnosticasEditor asignaturaId={a.id} diags={diags} recargar={recargar} />
            </div>
          </section>
        )
      })}

      {editando && <EditorInstrumentacion inst={editando} cerrar={() => { setEditando(null); recargar() }} />}
      {preAlta && <PreAltaModal inst={preAlta} onConfirm={confirmarPreAlta} onCancel={() => setPreAlta(null)} />}
      {vistaPrevia && <PreviewModal bytes={vistaPrevia} nombre="Instrumentación (vista previa)" onClose={() => setVistaPrevia(null)} />}
      {eliminarId && (
        <ConfirmDialog
          titulo="¿Eliminar materia?"
          mensaje="Se quitará la materia de la lista. Sus evidencias y diagnósticas se conservan."
          onCancel={() => setEliminarId(null)}
          onConfirm={() => { db.asignaturas.delete(eliminarId).then(recargar); setEliminarId(null) }}
        />
      )}
    </div>
  )
}

function DiagnosticasEditor({ asignaturaId, diags, recargar }: { asignaturaId: string; diags: Diagnostica[]; recargar: () => void }) {
  const [nombreHoja, setNombreHoja] = useState('Examen diagnóstico')
  const [msg, setMsg] = useState('')
  const agregar = async (f: File) => {
    setMsg('Optimizando captura…')
    const opt = await optimizarImagen(f)
    await db.diagnosticas.add({ id: uid(), asignaturaId, nombreHoja: nombreHoja.trim() || 'Evaluación diagnóstica', imagenDataUrl: opt.dataUrl, ancho: opt.ancho, alto: opt.alto, escala: 1, creadaEn: Date.now() })
    setMsg('')
    recargar()
  }
  return (
    <div className="mt-3 rounded-xl border t-line p-3">
      <p className="text-sm font-bold">Evaluación diagnóstica <span className="font-normal t-muted">(opcional, general de la materia)</span></p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={nombreHoja} onChange={(e) => setNombreHoja(e.target.value)} className={`${campo} max-w-56`} placeholder="Examen diagnóstico" />
        <label className={`${btnSec} flex cursor-pointer items-center gap-1 text-sm`}>
          <Icon name="image" size={15} /> Foto / captura
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) agregar(f); e.target.value = '' }} />
        </label>
      </div>
      {msg && <p role="status" className="mt-1 text-xs font-semibold text-[var(--accent)]">{msg}</p>}
      {diags.map((d) => (
        <div key={d.id} className="mt-2 flex items-center gap-2 rounded-lg t-inset p-2 text-sm">
          <img src={d.imagenDataUrl} alt="" className="h-12 w-12 rounded object-cover" />
          <span className="font-semibold">{d.nombreHoja}</span>
          <label className="ml-auto flex items-center gap-1 text-xs t-muted">Tamaño
            <input type="range" min={40} max={100} value={Math.round(d.escala * 100)} onChange={(e) => db.diagnosticas.update(d.id, { escala: parseInt(e.target.value) / 100 }).then(recargar)} className="h-8 w-24" />
          </label>
          <button onClick={() => db.diagnosticas.delete(d.id).then(recargar)} className="touch-btn rounded-lg bg-[var(--bad-soft)] px-2" title="Quitar" aria-label={`Quitar ${d.nombreHoja}`}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  )
}

/** Confirma los datos detectados antes de crear la materia. */
function PreAltaModal({ inst, onConfirm, onCancel }: { inst: Instrumentacion; onConfirm: (i: Instrumentacion) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Instrumentacion>(inst)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  const faltante = (v: string) => !v.trim()
  const input = (label: string, valor: string, set: (v: string) => void, k: string) => (
    <label key={k} className="grid gap-1 text-sm font-medium">{label}
      <input
        value={valor} onChange={(e) => set(e.target.value)}
        placeholder={faltante(valor) ? 'Falta — captúralo aquí' : undefined}
        className={`${campo} ${faltante(valor) ? 'ring-2 ring-[var(--warn-bg)]' : ''}`}
      />
    </label>
  )
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/70 px-0 pb-0 pt-[10dvh] md:p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Confirmar materia">
      <div className="dialogo mx-auto max-w-xl p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="display text-2xl font-bold">Confirmar materia</h3>
        <p className="text-sm t-muted">
          Se detectaron {inst.competencias.length} competencias en <span className="font-semibold t-ink2">{inst.originalNombre}</span>.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {input('Asignatura (3)', draft.asignatura, (v) => setDraft({ ...draft, asignatura: v }), 'a')}
          {input('Docente (2)', draft.docente, (v) => setDraft({ ...draft, docente: v }), 'd')}
          {input('Grupo (8)', draft.grupo, (v) => setDraft({ ...draft, grupo: v }), 'g')}
          {input('Período (7)', draft.periodo, (v) => setDraft({ ...draft, periodo: v }), 'p')}
          {input('División (1)', draft.division, (v) => setDraft({ ...draft, division: v }), 'dv')}
          {input('Clave (5)', draft.clave ?? '', (v) => setDraft({ ...draft, clave: v }), 'c')}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => draft.asignatura.trim() && onConfirm(draft)} className={`${btnPri} flex items-center gap-2`}><Icon name="check" size={15} /> Crear materia</button>
          <button onClick={onCancel} className={btnSec}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function EditorInstrumentacion({ inst, cerrar }: { inst: Instrumentacion; cerrar: () => void }) {
  const [draft, setDraft] = useState<Instrumentacion>(inst)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cerrar])
  const setComp = (idx: number, c: Competencia) => {
    setDraft({ ...draft, competencias: draft.competencias.map((x, i) => (i === idx ? c : x)) })
  }
  const guardar = async () => {
    await db.instrumentaciones.put({ ...draft, necesitaRevision: false, parseConfianza: 1 })
    cerrar()
  }
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/70 px-0 pb-0 pt-[10dvh] md:p-4" onClick={cerrar} role="dialog" aria-modal="true" aria-label={`Validar instrumentación de ${draft.asignatura}`}>
      <div className="dialogo mx-auto max-w-3xl p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="display text-2xl font-bold">Validar instrumentación — {draft.asignatura}</h3>
        <p className="text-sm t-muted">Corrige los datos si es necesario.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {(['asignatura', 'docente', 'grupo', 'periodo', 'division'] as const).map((k) => (
            <label key={k} className="grid gap-1 text-sm capitalize">{k}
              <input value={(draft[k] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={campo} />
            </label>
          ))}
        </div>
        {draft.competencias.map((c, i) => (
          <div key={i} className="mt-3 rounded-xl border t-line p-3">
            <div className="flex gap-2">
              <input value={c.numero} onChange={(e) => setComp(i, { ...c, numero: e.target.value })} className="touch-btn w-24 rounded-lg border t-line t-surface px-2" title="Número" aria-label="Número de competencia" />
              <button className="touch-btn rounded-lg t-surface2 px-3 text-sm" onClick={() => setDraft({ ...draft, competencias: draft.competencias.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
            <label className="mt-2 grid gap-1 text-xs font-semibold t-muted">Descripción
              <textarea value={c.descripcion} onChange={(e) => setComp(i, { ...c, descripcion: e.target.value })} rows={2} className="w-full rounded-xl border t-line t-surface p-2 text-sm font-normal t-ink" />
            </label>
            <label className="mt-2 grid gap-1 text-xs font-semibold t-muted">Temas y subtemas (uno por línea)
              <textarea value={c.temas.join('\n')} onChange={(e) => setComp(i, { ...c, temas: e.target.value.split('\n') })} rows={3} className="mt-0 w-full rounded-xl border t-line t-surface p-2 text-sm font-normal t-ink" placeholder="Un tema por línea" />
            </label>
            <label className="mt-2 grid gap-1 text-xs font-semibold t-muted">Indicadores (uno por línea)
              <IndicadoresEditor
                clave={`${draft.id}-comp-${i}`}
                indicadores={c.indicadores}
                onCommit={(inds) => setComp(i, { ...c, indicadores: inds })}
              />
            </label>
          </div>
        ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setDraft({ ...draft, competencias: [...draft.competencias, { numero: String(draft.competencias.length + 1), descripcion: '', temas: [], indicadores: [], evidenciasSugeridas: [] }] })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Competencia</button>
          <button onClick={guardar} className="touch-btn flex items-center gap-1 rounded-xl bg-[var(--ok-bg)] px-5 font-bold text-[var(--ok-ink)]"><Icon name="check" size={15} /> Guardar validado</button>
          <button onClick={cerrar} className={btnSec}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

/** Texto libre local: el padre recibe el parseo pero el valor mostrado
 *  nunca se reformatea al teclear, así no salta el cursor. */
function IndicadoresEditor({ clave, indicadores, onCommit }: { clave: string; indicadores: IndicadorAlcance[]; onCommit: (inds: IndicadorAlcance[]) => void }) {
  const [texto, setTexto] = useState(() => formatearIndicadores(indicadores))
  useEffect(() => {
    setTexto(formatearIndicadores(indicadores))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return (
    <textarea
      value={texto}
      onChange={(e) => { setTexto(e.target.value); onCommit(parsearIndicadoresTexto(e.target.value)) }}
      rows={4}
      className="mt-0 w-full rounded-xl border t-line t-surface p-2 text-sm font-normal t-ink"
      placeholder="A) descripción"
    />
  )
}
