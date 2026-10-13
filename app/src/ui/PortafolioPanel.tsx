import { useEffect, useMemo, useState } from 'react'
import { ORDEN_GRUPOS, grupoDe, uid, type Diagnostica, type Evidencia, type GrupoSeccion, type Instrumentacion, type PortafolioSeccion } from '../domain/types'
import { db, type AsignaturaMeta } from '../infrastructure/db'
import { descargarPDF } from '../infrastructure/fo14Pdf'
import { ensamblarPortafolio } from '../infrastructure/portfolioPdf'
import PreviewModal from './PreviewModal'
import Icon from './icons'
import { btnPri, btnSec, campo } from './MateriasPanel'

const NOMBRE_GRUPO: Record<GrupoSeccion, string> = {
  portada: 'Portada',
  indice: 'Índice',
  instrumentacion: 'Instrumentación original',
  diagnostica: 'Evaluación diagnóstica',
  contenido: 'Competencias y evidencias',
}

export default function PortafolioPanel({ asignaturas, instrumentaciones, evidencias, diagnosticas }: {
  asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; evidencias: Evidencia[]; diagnosticas: Diagnostica[]
}) {
  const [asigId, setAsigId] = useState(asignaturas[0]?.id ?? '')
  const asig = asignaturas.find((a) => a.id === asigId)
  const inst = instrumentaciones.find((i) => i.id === asig?.instrumentacionId)
  const evs = useMemo(() => evidencias.filter((e) => e.asignaturaId === asigId), [evidencias, asigId])
  const diags = useMemo(() => diagnosticas.filter((d) => d.asignaturaId === asigId), [diagnosticas, asigId])
  const [secciones, setSecciones] = useState<PortafolioSeccion[]>([])
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<Uint8Array | null>(null)

  const reconstruir = () => {
    const s: PortafolioSeccion[] = [
      { id: uid(), tipo: 'portada', titulo: 'Portada general del portafolio', grupo: 'portada' },
      { id: uid(), tipo: 'indice', titulo: 'Índice de contenido', grupo: 'indice' },
      ...(inst ? [{ id: uid(), tipo: 'instrumentacion' as const, titulo: `Instrumentación (${inst.originalNombre})`, grupo: 'instrumentacion' as const }] : []),
      ...diags.map((d) => ({ id: uid(), tipo: 'diagnostica' as const, titulo: d.nombreHoja, refId: d.id, grupo: 'diagnostica' as const })),
      ...(inst?.competencias.flatMap((c) => [
        { id: uid(), tipo: 'portada-competencia' as const, titulo: `Portada Competencia específica ${c.numero}`, refId: c.numero, grupo: 'contenido' as const },
        ...evs.filter((e) => e.competenciaNo === c.numero).map((e) => ({ id: uid(), tipo: 'evidencia' as const, titulo: e.nombreEvidencia || '(sin nombre)', refId: e.id, grupo: 'contenido' as const })),
      ]) ?? []),
      ...evs.filter((e) => !inst?.competencias.some((c) => c.numero === e.competenciaNo)).map((e) => ({ id: uid(), tipo: 'evidencia' as const, titulo: e.nombreEvidencia || '(sin nombre)', refId: e.id, grupo: 'contenido' as const })),
    ]
    setSecciones(s)
  }

  useEffect(() => { reconstruir() }, [asigId])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const mover = (id: string, d: number) => setSecciones((arr) => {
    // solo dentro del mismo grupo (orden de grupos fijo, orden interno libre)
    const idx = arr.map((x) => x.id)
    const i = idx.indexOf(id)
    const j = i + d
    if (i < 0 || j < 0 || j >= arr.length) return arr
    const g = (x: PortafolioSeccion) => x.grupo ?? grupoDe(x.tipo)
    if (g(arr[i]) !== g(arr[j])) return arr
    const a = [...arr]
    ;[a[i], a[j]] = [a[j], a[i]]
    return a
  })

  const generar = async (): Promise<Uint8Array | null> => {
    if (!asig) { setMsg('Elige una materia.'); return null }
    setMsg('Ensamblando portafolio…')
    try {
      const bytes = await ensamblarPortafolio(
        { id: uid(), asignaturaId: asigId, titulo: `Portafolio ${asig.nombre}`, secciones, creadaEn: Date.now() },
        evs, inst ?? null, diags,
        {
          asignatura: asig.nombre, division: evs[0]?.division ?? 'Ingeniería en Sistemas Computacionales',
          alumno: evs[0] ? `${evs[0].alumnoNombre} ${evs[0].numeroControl}` : '',
          docente: asig.docente, grupo: asig.grupo, periodo: asig.periodo,
        },
        setMsg,
      )
      await db.portafolios.put({ id: uid(), asignaturaId: asigId, titulo: `Portafolio ${asig.nombre}`, secciones, creadaEn: Date.now() })
      setMsg('Portafolio listo')
      return bytes
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`)
      return null
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold tick">Ensamblador de portafolios</h2>
      <p className="text-sm t-muted">Grupos en orden institucional fijo; dentro de cada grupo ordenas libremente.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={asigId} onChange={(e) => setAsigId(e.target.value)} className={`${campo} flex-1`}>
          {asignaturas.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.nombre}</option>)}
        </select>
        <button onClick={reconstruir} className={`${btnSec} flex items-center gap-1`}><Icon name="sliders" size={15} /> Re-armar secciones</button>
      </div>

      <div className="mt-3 grid gap-3">
        {ORDEN_GRUPOS.map((g) => {
          const items = secciones.map((s, i) => ({ s, i })).filter(({ s }) => (s.grupo ?? grupoDe(s.tipo)) === g)
          if (!items.length) return null
          return (
            <div key={g} className="rounded-xl border t-line p-2">
              <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide t-muted">{NOMBRE_GRUPO[g]}</p>
              {items.map(({ s, i }) => (
                <div
                  key={s.id} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = e.dataTransfer.getData('text/plain')
                    setSecciones((arr) => {
                      const a = arr.filter((x) => x.id !== from)
                      const me = arr.find((x) => x.id === from)
                      if (!me) return arr
                      const gg = (x: PortafolioSeccion) => x.grupo ?? grupoDe(x.tipo)
                      if (gg(me) !== g) return arr // sin cruzar grupos
                      const toIdx = a.findIndex((x) => x.id === s.id)
                      a.splice(toIdx, 0, me)
                      return a
                    })
                  }}
                  className="mb-1 flex cursor-grab items-center gap-2 rounded-xl t-inset p-2 text-sm active:cursor-grabbing"
                >
                  <span className="rounded t-surface2 px-2 py-1 text-[11px] font-bold uppercase">{s.tipo}</span>
                  <span className="truncate">{s.titulo}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => mover(s.id, -1)} className="touch-btn rounded t-surface2 px-2" title="Subir" aria-label={`Subir ${s.titulo}`}><Icon name="up" size={14} /></button>
                    <button onClick={() => mover(s.id, 1)} className="touch-btn rounded t-surface2 px-2" title="Bajar" aria-label={`Bajar ${s.titulo}`}><Icon name="down" size={14} /></button>
                    <button onClick={() => setSecciones((arr) => arr.filter((_x, xi) => xi !== i))} className="touch-btn rounded bg-red-500/20 px-2 text-red-200" title="Quitar" aria-label={`Quitar ${s.titulo}`}><Icon name="x" size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={async () => { const b = await generar(); if (b) setPreview(b) }} className={`${btnSec} flex items-center gap-1`}><Icon name="eye" size={15} /> Vista previa</button>
        <button onClick={async () => { const b = await generar(); if (b && asig) descargarPDF(b, `Portafolio_${asig.nombre.slice(0, 25)}`) }} className={`${btnPri} flex items-center gap-1`}><Icon name="download" size={15} /> Generar portafolio PDF</button>
      </div>
      {msg && <p role="status" className="mt-2 text-sm text-sky-200">{msg}</p>}
      {!inst && <p className="mt-2 text-sm text-amber-200">Sin instrumentación: súbela en Materias.</p>}
      {preview && asig && <PreviewModal bytes={preview} nombre={`Portafolio_${asig.nombre}`} onClose={() => setPreview(null)} />}
    </section>
  )
}
