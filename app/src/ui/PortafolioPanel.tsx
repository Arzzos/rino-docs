import { useEffect, useMemo, useState } from 'react'
import { aplicarPresetOrden, moverSeccion, uid, type Diagnostica, type Evidencia, type GrupoSeccion, type Instrumentacion, type PortafolioSeccion, type PresetOrden } from '../domain/types'
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

  const mover = (id: string, d: number) => setSecciones((arr) => moverSeccion(arr, id, d))

  const aplicarPreset = (p: PresetOrden) => setSecciones((arr) => aplicarPresetOrden(arr, p))

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
    <section className="reveal card overflow-hidden">
      <div className="border-b t-line p-4 md:p-6">
        <p className="overline">Paso 3 — Entrega institucional</p>
        <h2 className="display mt-1 text-3xl font-bold">Portafolio</h2>
        <p className="mt-1 text-sm t-muted">La portada siempre va primera. Índice e instrumentación se mueven como bloques libres.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={asigId} onChange={(e) => setAsigId(e.target.value)} aria-label="Elegir materia" className={`${campo} max-w-56 flex-1`}>
            {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <button onClick={reconstruir} className={`${btnSec} flex items-center gap-1`}><Icon name="sliders" size={15} /> Re-armar secciones</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Orden sugerido">
          <button onClick={() => aplicarPreset('institucional')} className={`${btnSec} text-xs`}>Orden institucional</button>
          <button onClick={() => aplicarPreset('indice-final')} className={`${btnSec} text-xs`}>Índice al final</button>
          <button onClick={() => aplicarPreset('instrumentacion-final')} className={`${btnSec} text-xs`}>Instrumentación al final</button>
        </div>
      </div>
      <ol className="anim grid gap-2 p-4 md:p-6">
        {secciones.map((s, i) => {
          const fija = s.tipo === 'portada'
          return (
            <li
              key={s.id}
              draggable={!fija}
              onDragStart={(e) => { if (!fija) e.dataTransfer.setData('text/plain', s.id) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const from = e.dataTransfer.getData('text/plain')
                setSecciones((arr) => {
                  const me = arr.find((x) => x.id === from)
                  if (!me || me.tipo === 'portada') return arr
                  const sin = arr.filter((x) => x.id !== from)
                  const destino = Math.max(1, sin.findIndex((x) => x.id === s.id))
                  sin.splice(destino < 0 ? sin.length : destino, 0, me)
                  return sin
                })
              }}
              className={`grid gap-1 rounded-xl border t-line p-2 text-sm ${fija ? '' : 'cursor-grab active:cursor-grabbing'} t-inset`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded t-surface2 px-2 py-1 text-[11px] font-bold uppercase">{NOMBRE_GRUPO[s.grupo ?? 'contenido']}</span>
                <span className="min-w-0 flex-1 truncate">{i === 0 ? `${s.titulo} (fija)` : s.titulo}</span>
              </div>
              {!fija && (
                <div className="flex justify-end gap-1">
                  <button onClick={() => mover(s.id, -1)} className="touch-btn rounded t-surface2 px-2" title="Subir" aria-label={`Subir ${s.titulo}`}><Icon name="up" size={14} /></button>
                  <button onClick={() => mover(s.id, 1)} className="touch-btn rounded t-surface2 px-2" title="Bajar" aria-label={`Bajar ${s.titulo}`}><Icon name="down" size={14} /></button>
                  <button onClick={() => setSecciones((arr) => arr.filter((_x, xi) => xi !== i))} className="touch-btn rounded bg-[var(--bad-soft)] px-2" title="Quitar" aria-label={`Quitar ${s.titulo}`}><Icon name="x" size={14} /></button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="barra-accion flex flex-wrap gap-2 border-t t-line p-4 md:px-6">
        <button onClick={async () => { const b = await generar(); if (b && asig) descargarPDF(b, `Portafolio_${asig.nombre.slice(0, 25)}`) }} className={`${btnPri} flex items-center gap-1`}><Icon name="download" size={15} /> Generar portafolio PDF</button>
        <button onClick={async () => { const b = await generar(); if (b) setPreview(b) }} className={`${btnSec} flex items-center gap-1`}><Icon name="eye" size={15} /> Vista previa</button>
      </div>
      {msg && <p role="status" className="px-4 text-sm font-semibold text-[var(--accent)] md:px-6">{msg}</p>}
      {!inst && <div className="px-4 pb-4 md:px-6"><p className="aviso aviso-warn">Sin instrumentación: súbela en Materias.</p></div>}
      {preview && asig && <PreviewModal bytes={preview} nombre={`Portafolio_${asig.nombre}`} onClose={() => setPreview(null)} />}
    </section>
  )
}
