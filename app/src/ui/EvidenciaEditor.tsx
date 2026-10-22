import { useEffect, useMemo, useRef, useState } from 'react'
import { LENGUAJES_CODIGO, uid, validarEvidencia, type Alumno, type BloqueContenido, type Evidencia, type Integrante, type Instrumentacion } from '../domain/types'
import { aplicarHerencia, aplicarMateria, herenciaPendiente, rederivarCompetencia, resolverMateriaGuardada, resolverMateriaInicial, type AjustesManuales } from '../domain/herencia'
import { BORRADOR_NUEVA, borradorConContenido, descartarBorrador, guardarBorrador } from '../infrastructure/borradores'
import { db, type AsignaturaMeta } from '../infrastructure/db'
import { optimizarImagen, rotar90 } from '../infrastructure/imageOptimizer'
import { resaltarHTML } from '../infrastructure/codeHighlight'
import { descargarPDF, generarEvidenciaPDF, mapaDeIndicadores, pdfAUrl } from '../infrastructure/fo14Pdf'
import PreviewModal from './PreviewModal'
import RecorteImagen from './RecorteImagen'
import VisorPdfMovil, { useEsMovil } from './PdfVista'
import LimiteVisor from './LimiteVisor'
import Icon from './icons'
import { btnPri, btnSec, campo } from './MateriasPanel'

const PASOS = ['Datos', 'Contenido', 'Revisar'] as const

export function nuevaEvidencia(perfil: Alumno): Evidencia {
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  return {
    id: '', asignaturaId: '', division: perfil.division, grupo: perfil.grupo,
    asignatura: '', docente: '', alumnoNombre: perfil.nombreCompleto, numeroControl: perfil.numeroControl,
    integrantes: [], fechaEntrega: hoy, competenciaNo: '', descripcionCompetencia: '',
    indicadoresSeleccionados: [], nombreEvidencia: '', bloques: [],
    creadaEn: 0, actualizadaEn: 0,
  }
}

export default function EvidenciaEditor({ perfil, asignaturas, instrumentaciones, inicial, titulo, borradorId, aviso, materiaInicial, onGuardado }: {
  perfil: Alumno; asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]
  inicial: Evidencia | null; titulo?: string; borradorId?: string | null; aviso?: string | null
  /** Materia heredada de la sección (filtro activo) al crear una evidencia nueva. */
  materiaInicial?: string
  onGuardado: () => void
}) {
  // La materia guardada manda; si no hay, se hereda la filtrada en la sección.
  // Nunca se elige sola: si no hay materia válida, el estudiante debe elegir.
  const [asigId, setAsigId] = useState(() => {
    const guardada = inicial
      ? resolverMateriaGuardada(asignaturas, inicial.asignaturaId, inicial.asignatura)
      : ''
    return resolverMateriaInicial(asignaturas, guardada, materiaInicial ?? '')
  })
  const asig = asignaturas.find((a) => a.id === asigId)
  const inst = instrumentaciones.find((i) => i.id === asig?.instrumentacionId)
  const [ev, setEv] = useState<Evidencia>(() => inicial ?? nuevaEvidencia(perfil))
  // Ajustes manuales de (2) y (4): solo aplican a su propia materia.
  const [ajustes, setAjustes] = useState<AjustesManuales>({})

  // La materia activa gobierna los datos heredados. Si desaparece de la lista,
  // se limpia para que el estudiante elija otra.
  useEffect(() => {
    if (asigId && !asignaturas.some((a) => a.id === asigId)) {
      setAsigId('')
      return
    }
    const a = asignaturas.find((x) => x.id === asigId)
    if (!a) return
    setEv((p) => {
      // Una evidencia ya capturada no se pisa: solo se rellenan los vacíos.
      if (inicial) return herenciaPendiente(p, a, perfil) ? aplicarHerencia(p, a, perfil) : p
      // Una nueva toma los datos de su materia.
      return aplicarMateria(p, a, perfil, ajustes)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignaturas, asigId, ajustes])
  const [paso, setPaso] = useState(0)
  const [estado, setEstado] = useState('')
  const [preview, setPreview] = useState<Uint8Array | null>(null)
  const [recorteAbierto, setRecorteAbierto] = useState(false)
  const [recorteSrc, setRecorteSrc] = useState('')
  const [recorteBloqueId, setRecorteBloqueId] = useState<string | null>(null)
  const fotoInicial = useRef('')
  if (!fotoInicial.current) fotoInicial.current = JSON.stringify({ ...ev, actualizadaEn: 0 })
  // Estado persistido de referencia para el autosave.
  const ultimaFoto = useRef(fotoInicial.current)

  // Borrador automático: se guarda aparte y caduca en 15 días.
  useEffect(() => {
    const id = setTimeout(() => {
      const clave = ev.id || borradorId || BORRADOR_NUEVA
      const foto = JSON.stringify({ ...ev, actualizadaEn: 0 })
      if (foto === fotoInicial.current) {
        // Sin cambios: solo borra si antes se había guardado algo.
        if (ultimaFoto.current !== fotoInicial.current) {
          descartarBorrador(clave).catch(() => undefined)
          ultimaFoto.current = fotoInicial.current
        }
        return
      }
      ultimaFoto.current = foto
      if (!borradorConContenido(ev)) descartarBorrador(clave).catch(() => undefined)
      else guardarBorrador(clave, ev.asignaturaId, ev).catch(() => undefined)
    }, 800)
    return () => clearTimeout(id)
  }, [ev, borradorId])

  /** Cambio explícito de materia: la nueva manda en (2)(3)(4) y re-deriva (7)(8)(9). */
  const cambiarMateria = (id: string) => {
    setAsigId(id)
    const a = asignaturas.find((x) => x.id === id)
    if (!a) {
      setEv((p) => ({ ...p, asignaturaId: '', asignatura: '', docente: '' }))
      return
    }
    const inst2 = instrumentaciones.find((i) => i.id === a.instrumentacionId)
    setEv((p) => rederivarCompetencia(aplicarMateria(p, a, perfil, ajustes), inst2?.competencias))
  }

  const compSel = inst?.competencias.find((c) => c.numero === ev.competenciaNo)
  const errores = useMemo(() => {
    const base = validarEvidencia(ev)
    // La competencia debe existir en la instrumentación de la materia activa.
    if (ev.competenciaNo && inst && !inst.competencias.some((c) => c.numero === ev.competenciaNo)) {
      base.push(`La competencia ${ev.competenciaNo} no es de ${asig?.nombre ?? 'esta materia'}`)
    }
    return base
  }, [ev, inst, asig])

  const elegirCompetencia = (numero: string) => {
    const c = inst?.competencias.find((x) => x.numero === numero)
    setEv((p) => ({ ...p, competenciaNo: numero, descripcionCompetencia: c?.descripcion ?? p.descripcionCompetencia, indicadoresSeleccionados: c ? c.indicadores.map((x) => x.letra) : p.indicadoresSeleccionados }))
  }

  const setBloques = (bloques: BloqueContenido[]) => setEv((p) => ({ ...p, bloques, actualizadaEn: Date.now() }))
  const addBloque = (b: BloqueContenido) => setBloques([...ev.bloques, b])
  const mover = (i: number, d: -1 | 1) => {
    const arr = [...ev.bloques]; const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setBloques(arr)
  }

  const subirImagen = async (f: File) => {
    setEstado('Optimizando imagen…')
    const opt = await optimizarImagen(f)
    addBloque({ id: uid(), tipo: 'imagen', dataUrl: opt.dataUrl, anchoOriginal: opt.ancho, altoOriginal: opt.alto, anchoPct: 100, escala: 1 })
    setEstado(`Imagen ${(opt.bytesAprox / 1024).toFixed(0)}KB · ${opt.ancho}×${opt.alto}`)
  }

  const guardar = async () => {
    if (errores.length) { setEstado('Revisa los campos marcados.'); setPaso(2); return }
    const id = ev.id || uid()
    await db.evidencias.put({ ...ev, id, creadaEn: ev.creadaEn || Date.now(), actualizadaEn: Date.now() })
    descartarBorrador(ev.id || borradorId || BORRADOR_NUEVA).catch(() => undefined)
    setEstado('Evidencia guardada')
    setEv(nuevaEvidencia(perfil))
    setPaso(0)
    onGuardado()
  }

  const pdfBytes = async (): Promise<Uint8Array | null> => {
    if (errores.length) { setEstado('Revisa los campos marcados.'); setPaso(2); return null }
    setEstado('Generando PDF…')
    const bytes = await generarEvidenciaPDF(ev, mapaDeIndicadores(ev, inst))
    setEstado('')
    return bytes
  }

  return (
    <section className="reveal card overflow-hidden">
      <div className="border-b t-line p-4 md:p-6">
        <p className="overline">FO-205P11000-14 · Paso {paso + 1} de 3 — {PASOS[paso]}</p>
        <h2 className="display mt-1 truncate text-3xl font-bold">{titulo ?? (inicial ? 'Editar evidencia' : 'Nueva evidencia')}</h2>
        <p className="mt-1 text-xs t-muted">Se guarda un borrador automático mientras editas. Caduca en 15 días si no guardas.</p>
        <p className={`mt-2 flex items-center gap-2 text-xs font-semibold ${asig ? 't-muted' : 'text-[var(--warn-bg)]'}`}>
          <Icon name={asig ? 'book' : 'alert'} size={14} />
          {asig ? `Materia: ${asig.nombre}${asig.docente ? ` · ${asig.docente}` : ''}${asig.grupo ? ` · ${asig.grupo}` : ''}` : 'Sin materia: elige una en el paso 1 para que el documento salga con la materia correcta.'}
        </p>
      </div>
      <div className="p-4 md:p-6">
      {aviso && <p role="status" className="aviso aviso-warn mt-2 text-xs">{aviso}</p>}
      <ol className="mt-3 grid grid-cols-3 gap-1">
        {PASOS.map((p, i) => (
          <li key={p}>
            <button onClick={() => setPaso(i)} aria-current={paso === i ? 'step' : undefined} className={`touch-btn relative w-full overflow-hidden rounded-xl text-sm font-bold transition-colors ${paso === i ? 't-tab-active' : i < paso ? 'bg-[var(--ok-soft)]' : 't-surface t-muted'}`}>
              <span className="mr-1 inline-grid h-5 w-5 place-items-center rounded-full bg-black/20">{i < paso ? <Icon name="check" size={12} /> : <span className="text-[11px]">{i + 1}</span>}</span>{p}
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 h-1 overflow-hidden rounded-full t-inset">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${((paso + 1) / 3) * 100}%` }} />
      </div>

      {paso === 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Materia
            <select
              value={asigId} onChange={(e) => cambiarMateria(e.target.value)}
              className={`${campo} ${!asig ? 'ring-2 ring-[var(--warn-bg)]' : ''}`}
            >
              <option value="">— elegir materia —</option>
              {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            {!asig && <span className="text-xs font-semibold text-[var(--warn-bg)]">Elige la materia para heredar asignatura, docente y grupo.</span>}
          </label>
          <label className="grid gap-1 text-sm">Docente (4)
            <input
              value={ev.docente}
              onChange={(e) => { setAjustes((p) => ({ ...p, docente: { valor: e.target.value, materiaId: asigId } })); setEv({ ...ev, docente: e.target.value }) }}
              className={campo}
              placeholder={asig?.docente || 'Nombre del docente'}
            />
            {asig && !asig.docente && <span className="text-xs font-semibold text-[var(--warn-bg)]">La instrumentación no trae docente: escríbelo aquí.</span>}
          </label>
          <label className="grid gap-1 text-sm">Grupo (2)
            <input
              value={ev.grupo}
              onChange={(e) => { setAjustes((p) => ({ ...p, grupo: { valor: e.target.value, materiaId: asigId } })); setEv({ ...ev, grupo: e.target.value }) }}
              className={campo}
              placeholder={asig?.grupo || perfil.grupo || 'Grupo'}
            />
          </label>
          <label className="grid gap-1 text-sm">Fecha de entrega (6)
            <input value={ev.fechaEntrega} onChange={(e) => setEv({ ...ev, fechaEntrega: e.target.value })} className={campo} />
          </label>
          <label className="grid gap-1 text-sm">Competencia No. (7)
            <select value={ev.competenciaNo} onChange={(e) => elegirCompetencia(e.target.value)} className={campo}>
              <option value="">— elegir —</option>
              {(inst?.competencias ?? []).map((c) => <option key={c.numero} value={c.numero}>{c.numero} — {c.descripcion.slice(0, 60)}</option>)}
            </select>
            {asig && (!inst || inst.competencias.length === 0) && (
              <span className="text-xs font-semibold text-[var(--warn-bg)]">Esta materia aún no tiene competencias. Súbelas en Materias.</span>
            )}
          </label>
          <label className="grid gap-1 text-sm">Evidencia de aprendizaje (10)
            <input value={ev.nombreEvidencia} onChange={(e) => setEv({ ...ev, nombreEvidencia: e.target.value })} placeholder="Ej. Práctica 3: límites laterales" className={campo} />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">Descripción (8) — se carga sola
            <textarea value={ev.descripcionCompetencia} onChange={(e) => setEv({ ...ev, descripcionCompetencia: e.target.value })} rows={2} className="w-full rounded-xl border t-line t-surface p-2" />
          </label>
          <div className="text-sm md:col-span-2">
            <p className="mb-1 font-semibold">Indicador de alcance (9)</p>
            <div className="flex flex-wrap gap-2">
              {(compSel?.indicadores ?? ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({ letra: l, descripcion: `Indicador ${l}` }))).map((ind) => (
                <label key={ind.letra} className={`touch-btn flex cursor-pointer items-center gap-2 rounded-xl border px-3 ${ev.indicadoresSeleccionados.includes(ind.letra) ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 't-line t-surface'}`} title={ind.descripcion}>
                  <input type="checkbox" className="h-5 w-5" checked={ev.indicadoresSeleccionados.includes(ind.letra)} onChange={() => setEv((p) => ({ ...p, indicadoresSeleccionados: p.indicadoresSeleccionados.includes(ind.letra) ? p.indicadoresSeleccionados.filter((x) => x !== ind.letra) : [...p.indicadoresSeleccionados, ind.letra] }))} />
                  <span className="font-bold">{ind.letra}</span>
                  <span className="max-w-44 truncate text-xs t-muted">{ind.descripcion}</span>
                </label>
              ))}
            </div>
          </div>
          <IntegrantesEditor integrantes={ev.integrantes} onChange={(integrantes) => setEv({ ...ev, integrantes })} />
          {asig && (
            <p className="aviso aviso-ok flex items-center gap-2 text-xs md:col-span-2">
              <Icon name="check" size={14} />
              Heredado de {asig.nombre}{asig.docente ? ` · ${asig.docente}` : ''}{asig.grupo ? ` · ${asig.grupo}` : ''} — el grupo y el docente se corrigen arriba.
            </p>
          )}
        </div>
      )}

      {paso === 1 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => addBloque({ id: uid(), tipo: 'texto', texto: '' })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Texto</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'subtitulo', texto: '' })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Título</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'codigo', lenguaje: 'python', texto: '' })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Código</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'tabla', encabezados: ['Col 1', 'Col 2'], filas: [['', '']] })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Tabla</button>
            <label className={`${btnSec} flex cursor-pointer items-center gap-1`}><Icon name="plus" size={15} /> Imagen
              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await subirImagen(f); e.target.value = '' }} />
            </label>
            <label className={`${btnSec} flex cursor-pointer items-center gap-1`}><Icon name="camera" size={15} /> Cámara
              <input type="file" accept="image/*" capture className="hidden" onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await subirImagen(f); e.target.value = '' }} />
            </label>
            <button onClick={() => addBloque({ id: uid(), tipo: 'referencia', texto: '' })} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Referencia</button>
            <button onClick={() => addBloque({ id: uid(), tipo: 'salto' })} className={`${btnSec} flex items-center gap-1`} title="Forzar salto de página"><Icon name="plus" size={15} /> Salto de página</button>
          </div>
          <div className="mt-2 grid gap-2">
            {ev.bloques.map((b, i) => (
              <div key={b.id} className="rounded-xl t-inset p-2">
                <div className="mb-1 flex items-center gap-1 text-xs t-muted">
                  <span className="flex items-center gap-1 font-bold uppercase"><Icon name={b.tipo === 'texto' ? 'text' : b.tipo === 'subtitulo' ? 'title' : b.tipo === 'salto' ? 'doc' : b.tipo === 'codigo' ? 'code' : b.tipo === 'tabla' ? 'table' : b.tipo === 'imagen' ? 'image' : 'link'} size={13} />{b.tipo}</span>
                  <button onClick={() => mover(i, -1)} className="touch-btn rounded t-surface2 px-2" title="Subir" aria-label="Subir bloque"><Icon name="up" size={14} /></button>
                  <button onClick={() => mover(i, 1)} className="touch-btn rounded t-surface2 px-2" title="Bajar" aria-label="Bajar bloque"><Icon name="down" size={14} /></button>
                  <button onClick={() => setBloques(ev.bloques.filter((x) => x.id !== b.id))} className="touch-btn ml-auto flex items-center gap-1 rounded bg-[var(--bad-soft)] px-2"><Icon name="x" size={14} /> Quitar</button>
                </div>
                {b.tipo === 'texto' && <textarea value={b.texto} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id ? { ...x, texto: e.target.value } : x)))} rows={3} className="w-full rounded-lg t-surface p-2 text-sm" placeholder="Desarrollo de la evidencia…" />}
                {b.tipo === 'subtitulo' && <input value={b.texto} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'subtitulo' ? { ...x, texto: e.target.value } : x)))} className="w-full rounded-lg t-surface p-2 text-sm font-bold" placeholder="1. Diseño de Red" />}
                {b.tipo === 'salto' && (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed t-line p-3 text-xs t-muted">
                    <Icon name="doc" size={14} /> Salto de página — lo siguiente empieza en hoja nueva
                  </div>
                )}
                {b.tipo === 'codigo' && <CodigoEditor b={b} onChange={(nb) => setBloques(ev.bloques.map((x) => (x.id === b.id ? nb : x)))} />}
                {b.tipo === 'tabla' && <TablaEditor b={b} onChange={(nb) => setBloques(ev.bloques.map((x) => (x.id === b.id ? nb : x)))} />}
                {b.tipo === 'imagen' && (
                  <div>
                    <img src={b.dataUrl} alt={b.pie ?? ''} className="max-h-64 rounded-lg" style={{ width: `${b.anchoPct}%` }} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const r = await rotar90(b.dataUrl)
                            setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'imagen' ? { ...x, dataUrl: r.dataUrl, anchoOriginal: r.ancho, altoOriginal: r.alto } : x)))
                            setEstado(`Imagen rotada · ${r.ancho}×${r.alto}`)
                          } catch {
                            setEstado('No se pudo rotar la imagen.')
                          }
                        }}
                        className="touch-btn flex items-center gap-1 rounded-lg t-surface2 px-3 text-sm"
                        title="Girar 90°"
                      ><Icon name="rotate" size={14} /> Rotar</button>
                      <button
                        onClick={() => { setRecorteBloqueId(b.id); setRecorteSrc(b.dataUrl); setRecorteAbierto(true) }}
                        className="touch-btn flex items-center gap-1 rounded-lg t-surface2 px-3 text-sm"
                        title="Recortar imagen"
                      ><Icon name="crop" size={14} /> Recortar</button>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs t-muted md:grid-cols-2">
                      <label className="flex items-center gap-2">Ancho {b.anchoPct}%
                        <input type="range" min={25} max={100} value={b.anchoPct} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'imagen' ? { ...x, anchoPct: parseInt(e.target.value) } : x)))} className="h-8 w-full" />
                      </label>
                      <label className="flex items-center gap-2">Ajuste vertical {Math.round(b.escala * 100)}%
                        <input type="range" min={25} max={100} value={Math.round(b.escala * 100)} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'imagen' ? { ...x, escala: parseInt(e.target.value) / 100 } : x)))} className="h-8 w-full" />
                      </label>
                    </div>
                    <input value={b.pie ?? ''} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'imagen' ? { ...x, pie: e.target.value } : x)))} placeholder="Pie de imagen (opcional)" className="mt-1 w-full rounded-lg t-surface p-2 text-sm" />
                  </div>
                )}
                {b.tipo === 'referencia' && <input value={b.texto} onChange={(e) => setBloques(ev.bloques.map((x) => (x.id === b.id && x.tipo === 'referencia' ? { ...x, texto: e.target.value } : x)))} placeholder="Autor (año). Título. URL" className="w-full rounded-lg t-surface p-2 text-sm" />}
              </div>
            ))}
            {ev.bloques.length === 0 && <p className="text-sm t-muted">Sin bloques. Agrega texto, títulos, código, tablas, imágenes o referencias.</p>}
          </div>
          <VistaPreviaViva ev={ev} inst={inst} />
        </div>
      )}

      {paso === 2 && (
        <div className="mt-3 text-sm">
          <p className="font-bold">{ev.nombreEvidencia || '(sin nombre)'} · Comp. {ev.competenciaNo || '—'} · {ev.bloques.length} bloques</p>
          <TablaDatos ev={ev} />
          {errores.length > 0
            ? <ul className="mt-2 list-disc pl-5 text-[var(--warn-bg)]">{errores.map((e) => <li key={e}>{e}</li>)}</ul>
            : <p className="mt-2 font-semibold text-[var(--ok-bg)]">Validación completa. Lista para exportar.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={guardar} className={`${btnSec} flex items-center gap-1`}><Icon name="check" size={15} /> Guardar</button>
            <button onClick={async () => { const b = await pdfBytes(); if (b) setPreview(b) }} className={`${btnSec} flex items-center gap-1`}><Icon name="eye" size={15} /> Vista previa</button>
            <button onClick={async () => { const b = await pdfBytes(); if (b) descargarPDF(b, `FO-205P11000-14_${ev.nombreEvidencia.slice(0, 30)}_${ev.numeroControl}`) }} className={`${btnPri} flex items-center gap-1`}><Icon name="download" size={15} /> Descargar PDF</button>
          </div>
          {estado && <p role="status" className="mt-2 font-semibold text-[var(--accent)]">{estado}</p>}
        </div>
      )}

      <div className="barra-accion mt-3 flex flex-wrap items-center gap-2">
        <button disabled={paso === 0} onClick={() => setPaso(paso - 1)} className={`${btnSec} flex items-center gap-1 disabled:opacity-40`}><Icon name="left" size={15} /> Atrás</button>
        {paso === 0 && !asig && asignaturas.length > 0 && (
          <span className="text-xs font-semibold text-[var(--warn-bg)]">Selecciona la materia para continuar con sus datos.</span>
        )}
        {paso < 2 && <button onClick={() => { if (paso === 0 && !asig && asignaturas.length > 0) { setEstado('Elige primero la materia: de ahí se heredan asignatura, docente y grupo.'); return } setEstado(''); setPaso(paso + 1) }} className={`${btnPri} flex items-center gap-1`}>Siguiente <Icon name="right" size={15} /></button>}
      </div>
      {estado && paso !== 2 && <p role="status" className="mt-2 text-sm font-semibold text-[var(--accent)]">{estado}</p>}
      </div>
      {preview && <PreviewModal bytes={preview} nombre={`FO-205P11000-14_${ev.nombreEvidencia || 'evidencia'}`} onClose={() => setPreview(null)} />}
      {recorteAbierto && (
        <RecorteImagen
          dataUrl={recorteSrc}
          onAplicar={(nuevoDataUrl, ancho, alto) => {
            setBloques(ev.bloques.map((x) => (x.id === recorteBloqueId && x.tipo === 'imagen' ? { ...x, dataUrl: nuevoDataUrl, anchoOriginal: ancho, altoOriginal: alto } : x)))
            setRecorteAbierto(false)
            setRecorteBloqueId(null)
            setEstado('Imagen recortada')
          }}
          onCancel={() => setRecorteAbierto(false)}
        />
      )}
    </section>
  )
}

/**
 * Tabla de datos tal como saldrá impresa en el FO-205P11000-14.
 * Sirve para que el estudiante revise la materia, el docente y la competencia
 * antes de exportar: es donde se cuelan los datos de otra materia.
 */
function TablaDatos({ ev }: { ev: Evidencia }) {
  const equipo = [ev.alumnoNombre, ev.numeroControl, ...ev.integrantes.map((x) => `${x.nombre} ${x.control}`)].filter(Boolean).join(' · ')
  const filas: [string, string][] = [
    ['División (1)', ev.division],
    ['Grupo (2)', ev.grupo],
    ['Asignatura (3)', ev.asignatura],
    ['Docente (4)', ev.docente],
    ['Nombre y número de control (5)', equipo],
    ['Fecha de entrega (6)', ev.fechaEntrega],
    ['Competencia No. (7)', ev.competenciaNo],
    ['Descripción (8)', ev.descripcionCompetencia],
    ['Indicador de alcance (9)', ev.indicadoresSeleccionados.join(', ')],
    ['Evidencia de aprendizaje (10)', ev.nombreEvidencia],
  ]
  return (
    <div className="mt-3 overflow-hidden rounded-xl border t-line">
      <p className="border-b t-line t-surface2 px-3 py-2 text-xs font-bold uppercase">Tabla de datos del documento</p>
      <dl className="grid gap-x-3 gap-y-1 p-3 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold t-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Vista previa en vivo del documento. */
function VistaPreviaViva({ ev, inst }: { ev: Evidencia; inst: Instrumentacion | null | undefined }) {
  const [abierta, setAbierta] = useState(false)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const movil = useEsMovil()
  useEffect(() => {
    if (!abierta) return
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const b = await generarEvidenciaPDF(ev, mapaDeIndicadores(ev, inst ?? undefined))
        if (vivo) setBytes(b)
      } catch { /* noop */ }
    }, 1200)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [ev, inst, abierta])
  return (
    <div className="mt-3 overflow-hidden rounded-xl border t-line">
      <button
        onClick={() => setAbierta(!abierta)} aria-expanded={abierta}
        className="touch-btn flex w-full items-center gap-2 px-3 py-3 text-sm font-bold"
      >
        <Icon name="eye" size={15} /> Vista previa en vivo
        <span className="ml-auto text-xs font-normal t-muted">{abierta ? 'Ocultar' : 'Ver cómo queda el documento'}</span>
      </button>
      {abierta && (
        bytes
          ? movil
            ? <div className="h-[62vh] md:h-[70vh]"><LimiteVisor bytes={bytes} nombre="Vista previa del documento"><VisorPdfMovil bytes={bytes} nombre="Vista previa del documento" /></LimiteVisor></div>
            : <MarcoNativo bytes={bytes} titulo="Vista previa del documento" clase="h-[62vh] w-full bg-white md:h-[70vh]" />
          : <p role="status" className="px-3 pb-3 text-sm t-muted">Generando vista previa…</p>
      )}
    </div>
  )
}

// Marco con URL temporal para el visor nativo de escritorio.
function MarcoNativo({ bytes, titulo, clase }: { bytes: Uint8Array; titulo: string; clase: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = pdfAUrl(bytes)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes])
  if (!url) return null
  return <iframe src={url} title={titulo} className={clase} />
}

function IntegrantesEditor({ integrantes = [], onChange }: { integrantes?: Integrante[]; onChange: (v: Integrante[]) => void }) {
  const lista = integrantes ?? []
  const [nom, setNom] = useState('')
  const [ctl, setCtl] = useState('')
  return (
    <div className="rounded-xl border t-line p-2 text-sm md:col-span-2">
      <p className="font-semibold">Equipo (5) <span className="font-normal t-muted">— solo si el trabajo es en equipo; se agregan a mano</span></p>
      {lista.map((x, i) => (
        <div key={i} className="mt-1 flex items-center gap-2 rounded-lg t-inset px-2 py-1">
          <span>{x.nombre} · {x.control}</span>
          <button onClick={() => onChange(lista.filter((_, j) => j !== i))} className="touch-btn ml-auto rounded bg-[var(--bad-soft)] px-2">Quitar</button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nombre del integrante" className={`${campo} flex-1`} />
        <input value={ctl} onChange={(e) => setCtl(e.target.value)} placeholder="No. control" className={`${campo} w-40`} />
        <button onClick={() => { if (!nom.trim()) return; onChange([...lista, { nombre: nom.trim(), control: ctl.trim() }]); setNom(''); setCtl('') }} className={`${btnSec} flex items-center gap-1`}><Icon name="plus" size={15} /> Agregar</button>
      </div>
    </div>
  )
}

function CodigoEditor({ b, onChange }: { b: Extract<BloqueContenido, { tipo: 'codigo' }>; onChange: (n: Extract<BloqueContenido, { tipo: 'codigo' }>) => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(b.texto) } catch { /* portapapeles no disponible */ }
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <select value={b.lenguaje} onChange={(e) => onChange({ ...b, lenguaje: e.target.value as never })} className="touch-btn rounded-lg border t-line t-surface px-2 text-sm">
          {LENGUAJES_CODIGO.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <button onClick={copiar} className="touch-btn flex items-center gap-1 rounded-lg t-surface2 px-3 text-sm"><Icon name="copy" size={14} /> Copiar</button>
      </div>
      <textarea value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} rows={5} spellCheck={false} className="w-full rounded-lg bg-black p-2 font-mono text-sm text-emerald-200" placeholder={b.lenguaje === 'sql' ? 'SELECT ...' : b.lenguaje === 'python' ? 'def ...' : '// código...'} />
      {b.texto.trim() && (
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-[#0d1117] p-3 font-mono text-[13px] leading-relaxed"><code className={`language-${b.lenguaje}`} dangerouslySetInnerHTML={{ __html: resaltarHTML(b.texto, b.lenguaje) }} /></pre>
      )}
    </div>
  )
}

function TablaEditor({ b, onChange }: { b: Extract<BloqueContenido, { tipo: 'tabla' }>; onChange: (n: Extract<BloqueContenido, { tipo: 'tabla' }>) => void }) {
  return (
    <div className="grid gap-1 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>{b.encabezados.map((h, i) => (
              <th key={i} className="border t-line t-surface2 p-1">
                <input value={h} onChange={(e) => { const encabezados = b.encabezados.map((x, j) => (j === i ? e.target.value : x)); onChange({ ...b, encabezados }) }} className="w-full bg-transparent text-center" />
              </th>
            ))}
              <th className="w-10"><button onClick={() => onChange({ ...b, encabezados: [...b.encabezados, 'Col'], filas: b.filas.map((r) => [...r, '']) })} className="touch-btn rounded t-surface2 px-2" title="Agregar columna"><Icon name="plus" size={14} /></button></th>
            </tr>
          </thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i}>{f.map((c, j) => (
                <td key={j} className="border t-line p-1">
                  <input value={c} onChange={(e) => { const filas = b.filas.map((r, k) => (k === i ? r.map((v, l) => (l === j ? e.target.value : v)) : r)); onChange({ ...b, filas }) }} className="w-full bg-transparent" />
                </td>
              ))}
                <td><button onClick={() => onChange({ ...b, filas: b.filas.filter((_, k) => k !== i) })} className="touch-btn rounded bg-[var(--bad-soft)] px-2" title="Eliminar fila"><Icon name="x" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange({ ...b, filas: [...b.filas, b.encabezados.map(() => '')] })} className="touch-btn flex w-fit items-center gap-1 rounded-lg t-surface2 px-3"><Icon name="plus" size={14} /> Fila</button>
    </div>
  )
}
