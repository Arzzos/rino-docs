import { useEffect, useState } from 'react'
import { DIVISIONES_TESCI, uid, type Alumno, type Competencia, type Diagnostica, type Evidencia, type Instrumentacion } from './domain/types'
import { aceptacionVigente, guardarAceptacion, leerAceptacion } from './domain/legal'
import ModalLegal from './ui/Terminos'
import { necesitaMigracionEvidencia, normalizarEvidencia } from './domain/migrate'
import { PerfilRepo, db, type AsignaturaMeta, type BorradorEvidencia } from './infrastructure/db'
import { cargarBorrador, descartarBorrador, expiraEn, haceCuanto, limpiarBorradores, listarBorradores, retomarBorrador } from './infrastructure/borradores'
import { descargarPDF, generarEvidenciaPDF, mapaDeIndicadores } from './infrastructure/fo14Pdf'
import { base64ABytes } from './infrastructure/instrumentParser'
import { bytesABase64 } from './infrastructure/docxFullRender'
import { PDFDocument } from 'pdf-lib'
import PreviewModal from './ui/PreviewModal'
import ErrorBoundary from './ui/ErrorBoundary'
import Icon, { type IconName } from './ui/icons'
import MateriasPanel, { btnPri, btnSec, campo } from './ui/MateriasPanel'
import ConfirmDialog from './ui/ConfirmDialog'
import EvidenciaEditor from './ui/EvidenciaEditor'
import PortafolioPanel from './ui/PortafolioPanel'

type Tab = 'perfil' | 'materias' | 'evidencias' | 'portafolio'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'perfil', label: 'Perfil', icon: 'user' },
  { id: 'materias', label: 'Materias', icon: 'book' },
  { id: 'evidencias', label: 'Evidencias', icon: 'doc' },
  { id: 'portafolio', label: 'Portafolio', icon: 'box' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('perfil')
  const [perfil, setPerfil] = useState<Alumno>(() => PerfilRepo.cargar())
  const [asignaturas, setAsignaturas] = useState<AsignaturaMeta[]>([])
  const [instrumentaciones, setInstrumentaciones] = useState<Instrumentacion[]>([])
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [diagnosticas, setDiagnosticas] = useState<Diagnostica[]>([])
  const [instalable, setInstalable] = useState<Event | null>(null)
  // Términos: gate bloqueante hasta aceptar la versión vigente.
  const [terminosOk, setTerminosOk] = useState(() => aceptacionVigente(leerAceptacion()))
  const [verTerminos, setVerTerminos] = useState(false)
  const aceptarTerminos = () => { guardarAceptacion(); setTerminosOk(true) }
  // Durante la edición se oculta la navegación para no perder el progreso.
  const [bloqueoNav, setBloqueoNav] = useState(false)
  const [tema, setTema] = useState<string>(() => {
    try {
      return localStorage.getItem('rino.tema')
        || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    try { localStorage.setItem('rino.tema', tema) } catch { /* noop */ }
  }, [tema])

  useEffect(() => {
    recargar()
    const h = (e: Event) => { e.preventDefault(); setInstalable(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-dvh t-bg pb-24 t-ink md:pb-10">
      <header className="brand-header sticky top-0 z-20 border-b t-line backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#a52c3c] to-[#5e1620] text-[#faf5ec]">
            <Icon name="shield" size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide">RINO DOCS</p>
            <p className="text-[11px] t-muted">Portafolios y evidencias · TESCI</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
              className="touch-btn grid place-items-center rounded-xl t-surface2 t-hover px-3"
              title={tema === 'dark' ? 'Cambiar a fondo claro' : 'Cambiar a fondo oscuro'}
              aria-label={tema === 'dark' ? 'Cambiar a fondo claro' : 'Cambiar a fondo oscuro'}
            >
              <Icon name={tema === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
            {instalable && (
              <button className="touch-btn flex items-center gap-1 rounded-lg bg-amber-400 px-3 text-sm font-bold text-slate-950"
                onClick={() => { (instalable as unknown as { prompt: () => void }).prompt(); setInstalable(null) }}>
                <Icon name="download" size={15} /> Instalar
              </button>
            )}
          </div>
        </div>
        <nav className="mx-auto hidden max-w-5xl grid-cols-4 gap-1 px-4 py-3 md:grid" aria-label="Pestañas">
          {bloqueoNav ? (
            <p role="status" className="col-span-4 rounded-xl t-inset px-3 py-2 text-center text-xs t-muted">Editando evidencia — vuelve a Mis evidencias para cambiar de pestaña.</p>
          ) : (
            TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`touch-btn flex items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors ${tab === t.id ? 't-tab-active' : 't-surface t-ink2 t-hover'}`}>
                <Icon name={t.icon} size={16} /> {t.label}
              </button>
            ))
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <ErrorBoundary>
          {tab === 'perfil' && <PerfilPanel perfil={perfil} setPerfil={setPerfil} />}
          {tab === 'materias' && <MateriasPanel asignaturas={asignaturas} instrumentaciones={instrumentaciones} diagnosticas={diagnosticas} recargar={recargar} />}
          {tab === 'evidencias' && <EvidenciasTab perfil={perfil} asignaturas={asignaturas} instrumentaciones={instrumentaciones} evidencias={evidencias} recargar={recargar} onBloqueo={setBloqueoNav} />}
          {tab === 'portafolio' && <PortafolioPanel asignaturas={asignaturas} instrumentaciones={instrumentaciones} evidencias={evidencias} diagnosticas={diagnosticas} />}
        </ErrorBoundary>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 border-t t-line t-bg95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden" aria-label="Pestañas">
        {bloqueoNav ? (
          <p role="status" className="col-span-4 rounded-xl t-inset px-3 py-2 text-center text-[11px] t-muted">Editando evidencia — vuelve a Mis evidencias para cambiar de pestaña.</p>
        ) : (
          TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); window.scrollTo({ top: 0 }) }}
              className={`touch-btn flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-colors ${tab === t.id ? 't-tab-active' : 't-surface t-muted'}`}>
              <Icon name={t.icon} size={19} />{t.label}
            </button>
          ))
        )}
      </nav>

      <footer className="mx-auto max-w-5xl px-4 pb-6 text-center">
        <p className="mb-2 text-[11px] t-muted">Versión alpha — se aceptan comentarios y propuestas de funciones.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs t-muted">
          <button onClick={() => setVerTerminos(true)} className="hover:text-sky-300">Términos y privacidad</button>
          <span className="font-semibold t-muted">Desarrollado por Espinal G. Rasiel A.</span>
          <a href="https://github.com/Arzzos" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-sky-300">
            <Icon name="github" size={14} /> github.com/Arzzos
          </a>
          <a href="https://arzzos.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-sky-300">
            <Icon name="globe" size={14} /> arzzos.com
          </a>
          <a href="https://instagram.com/arzzos" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-sky-300">
            <Icon name="insta" size={14} /> instagram.com/arzzos
          </a>
        </div>
      </footer>
      {!terminosOk && <ModalLegal modo="bloqueo" onAceptar={aceptarTerminos} />}
      {terminosOk && verTerminos && <ModalLegal modo="lectura" onCerrar={() => setVerTerminos(false)} />}
    </div>
  )

  async function recargar() {
    limpiarBorradores().catch(() => undefined)
    const [asigs, insts, evs, diags] = await Promise.all([
      db.asignaturas.toArray(),
      db.instrumentaciones.toArray(),
      db.evidencias.toArray(),
      db.diagnosticas.toArray(),
    ])
    // Normaliza registros anteriores al esquema actual.
    const normalizadas = evs.map(normalizarEvidencia)
    const pendientes = evs.filter(necesitaMigracionEvidencia)
    if (pendientes.length) {
      await Promise.all(normalizadas.filter((e) => pendientes.some((p) => p.id === e.id)).map((e) => db.evidencias.put(e)))
    }
    setAsignaturas(asigs)
    setInstrumentaciones(insts)
    setEvidencias(normalizadas)
    setDiagnosticas(diags)
  }
}

function PerfilPanel({ perfil, setPerfil }: { perfil: Alumno; setPerfil: (p: Alumno) => void }) {
  const [ok, setOk] = useState(false)
  const guardar = () => { PerfilRepo.guardar(perfil); setOk(true); setTimeout(() => setOk(false), 2000) }
  return (
    <section className="reveal card p-4 md:p-6">
      <h2 className="text-lg font-bold tick">Perfil del estudiante</h2>
      <p className="mb-4 text-sm t-muted">Se hereda en todos los membretes. El equipo se agrega por evidencia.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Nombre completo
          <input className={campo} value={perfil.nombreCompleto} onChange={(e) => setPerfil({ ...perfil, nombreCompleto: e.target.value })} placeholder="Apellidos Nombres" autoComplete="name" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Número de control
          <input className={campo} value={perfil.numeroControl} onChange={(e) => setPerfil({ ...perfil, numeroControl: e.target.value })} placeholder="E22670001" />
        </label>
        <label className="grid gap-1 text-sm font-medium">División (1)
          <select className={campo} value={perfil.division} onChange={(e) => setPerfil({ ...perfil, division: e.target.value })}>
            {DIVISIONES_TESCI.map((d) => <option key={d} value={d} className="text-slate-900">{d}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Grupo (2)
          <input className={campo} value={perfil.grupo} onChange={(e) => setPerfil({ ...perfil, grupo: e.target.value })} placeholder="1011V" />
        </label>
      </div>
      <button onClick={guardar} className={`${btnPri} mt-4 flex items-center gap-2`}>
        {ok ? <Icon name="check" size={16} /> : <Icon name="download" size={16} />} {ok ? 'Guardado' : 'Guardar local'}
      </button>
    </section>
  )
}

function EvidenciasTab({ perfil, asignaturas, instrumentaciones, evidencias, recargar, onBloqueo }: {
  perfil: Alumno; asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[]; evidencias: Evidencia[]; recargar: () => void; onBloqueo: (b: boolean) => void
}) {
  const [editando, setEditando] = useState<Evidencia | null>(null)
  const [creando, setCreando] = useState(false)
  const [inicialNueva, setInicialNueva] = useState<Evidencia | null>(null)
  const [borradorId, setBorradorId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [borradores, setBorradores] = useState<BorradorEvidencia[]>([])
  const [filtro, setFiltro] = useState(asignaturas[0]?.id ?? '')
  const [eliminarId, setEliminarId] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Evidencia | null>(null)
  const [vistaPdf, setVistaPdf] = useState<{ bytes: Uint8Array; nombre: string } | null>(null)
  const [falloPdf, setFalloPdf] = useState<string | null>(null)
  const lista = evidencias.filter((e) => !filtro || e.asignaturaId === filtro)
  const borradoresVisibles = borradores.filter((b) => !filtro || b.asignaturaId === filtro)
  const editandoActivo = creando || !!editando

  useEffect(() => {
    onBloqueo(editandoActivo)
    return () => onBloqueo(false)
  }, [editandoActivo, onBloqueo])

  const cargarListaBorradores = async () => {
    setBorradores(await listarBorradores())
  }

  useEffect(() => {
    cargarListaBorradores().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const empezarNueva = () => {
    setBorradorId(uid())
    setAviso(null)
    setCreando(true)
  }

  const continuarBorrador = async (b: BorradorEvidencia) => {
    const tocado = await retomarBorrador(b.id)
    const ev = (tocado ?? b).evidencia
    setBorradorId(b.id)
    if (ev.id) {
      setAviso('Continuaste tu borrador más reciente.')
      setEditando(ev)
    } else {
      setAviso(null)
      setCreando(true)
      setInicialNueva(ev)
    }
    cargarListaBorradores().catch(() => undefined)
  }

  const empezarEdicion = async (e: Evidencia) => {
    const b = await cargarBorrador(e.id)
    const foto = (x: Evidencia) => JSON.stringify({ ...normalizarEvidencia(x), actualizadaEn: 0 })
    if (b && b.actualizadaEn > (e.actualizadaEn || 0) && foto(b.evidencia) !== foto(e)) {
      // Si hay un borrador más reciente, se abre ese.
      const tocado = await retomarBorrador(b.id)
      void tocado
      setBorradorId(e.id)
      setAviso('Continuaste tu borrador más reciente.')
      setEditando(b.evidencia)
    } else {
      setBorradorId(e.id)
      setAviso(null)
      setEditando(e)
    }
  }

  const cerrarEditor = () => {
    setCreando(false)
    setEditando(null)
    setInicialNueva(null)
    setBorradorId(null)
    setAviso(null)
    cargarListaBorradores().catch(() => undefined)
  }

  if (creando || editando) {
    return (
      <div className="grid gap-3">
        <button onClick={cerrarEditor} className="touch-btn flex w-fit items-center gap-2 rounded-xl t-surface2 px-4">
          <Icon name="left" size={16} /> Mis evidencias
        </button>
        <EvidenciaEditor
          perfil={perfil} asignaturas={asignaturas} instrumentaciones={instrumentaciones}
          titulo={editando ? 'Editar evidencia' : 'Nueva evidencia'}
          borradorId={borradorId} aviso={aviso}
          inicial={editando ? normalizarEvidencia(editando) : inicialNueva ? normalizarEvidencia(inicialNueva) : null} onGuardado={() => { recargar(); cerrarEditor() }}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tick">Evidencias {lista.length > 0 && <span className="text-sm font-normal t-muted">({lista.length})</span>}</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${campo} ml-auto max-w-56`}>
            <option value="" className="text-slate-900">Todas las materias</option>
            {asignaturas.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.nombre}</option>)}
          </select>
          <button onClick={empezarNueva} className={`${btnPri} flex items-center gap-2`}><Icon name="plus" size={16} /> Nueva</button>
          <button onClick={() => setImportando(true)} className="touch-btn flex items-center gap-2 rounded-xl t-surface2 px-4 font-semibold" title="Agregar un PDF ya entregado, tal cual se entregó"><Icon name="upload" size={16} /> Importar PDF</button>
        </div>
        {asignaturas.length === 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
            <Icon name="alert" size={16} /> Primero crea una materia y sube su instrumentación en la pestaña Materias.
          </p>
        )}
        {falloPdf && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{falloPdf}</p>}
        <div className="mt-3 grid gap-2">
          {borradoresVisibles.length > 0 && (
            <p className="px-1 text-xs font-bold uppercase tracking-wide t-muted">Borradores ({borradoresVisibles.length})</p>
          )}
          {borradoresVisibles.map((b) => {
            const ev = b.evidencia
            const mat = asignaturas.find((a) => a.id === b.asignaturaId)
            return (
              <div key={`borrador-${b.id}`} className="rounded-xl border border-dashed border-amber-400/50 t-inset p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-950">Borrador</span>
                  <p className="min-w-0 flex-1 truncate font-semibold">{ev.nombreEvidencia || '(sin nombre)'}{ev.competenciaNo ? ` · Comp. ${ev.competenciaNo}` : ''}</p>
                </div>
                <p className="mt-1 text-xs t-muted">
                  {mat ? `${mat.nombre} · ` : ''}{ev.bloques.length} bloques · {haceCuanto(b.actualizadaEn)} · se elimina {expiraEn(b.actualizadaEn)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => continuarBorrador(b)} className="touch-btn flex items-center gap-1 rounded-lg bg-amber-400 px-3 font-bold text-slate-950"><Icon name="check" size={15} /> Continuar</button>
                  <button onClick={() => descartarBorrador(b.id).then(cargarListaBorradores)} className="touch-btn rounded-lg bg-red-500/20 px-3 text-red-200">Descartar</button>
                </div>
              </div>
            )
          })}
          {lista.map((e) => e.origen === 'pdf' ? (
            <div key={e.id} className="flex items-center gap-2 rounded-xl border border-sky-400/25 t-inset p-2 text-sm t-ring">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1 truncate font-semibold">
                  <span className="rounded bg-sky-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-950">PDF</span>
                  {e.nombreEvidencia || '(sin nombre)'} · Comp. {e.competenciaNo}
                </p>
                <p className="text-xs t-muted">{e.asignatura}{e.pdfPaginas ? ` · ${e.pdfPaginas} págs.` : ''} · tal cual se entregó</p>
              </div>
              <button onClick={() => {
                if (!e.pdfBase64) return
                try {
                  setFalloPdf(null)
                  setVistaPdf({ bytes: base64ABytes(e.pdfBase64), nombre: e.nombreEvidencia || 'evidencia' })
                } catch {
                  setFalloPdf('El PDF guardado está dañado y no se pudo abrir.')
                }
              }} className="touch-btn ml-auto flex shrink-0 items-center gap-1 rounded-lg t-surface2 px-3" title="Ver PDF">
                <Icon name="eye" size={15} /> Ver
              </button>
              <button onClick={() => {
                if (!e.pdfBase64) return
                try {
                  setFalloPdf(null)
                  descargarPDF(base64ABytes(e.pdfBase64), e.nombreEvidencia || 'evidencia')
                } catch {
                  setFalloPdf('El PDF guardado está dañado y no se pudo descargar.')
                }
              }} className="touch-btn flex shrink-0 items-center gap-1 rounded-lg bg-emerald-400 px-3 font-bold text-slate-950" title="Descargar original">
                <Icon name="download" size={15} /> PDF
              </button>
              <button onClick={() => setCorrigiendo(e)} className="touch-btn shrink-0 rounded-lg t-surface2 px-3" title="Corregir nombre o competencia">Corregir</button>
              <button onClick={() => setEliminarId(e.id)} className="touch-btn shrink-0 rounded-lg bg-red-500/20 px-2 text-red-200" title="Eliminar evidencia" aria-label="Eliminar evidencia">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ) : (
            <div key={e.id} className="flex items-center gap-2 rounded-xl t-inset p-2 text-sm t-ring">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.nombreEvidencia || '(sin nombre)'} · Comp. {e.competenciaNo}</p>
                <p className="text-xs t-muted">{e.asignatura} · {e.bloques.length} bloques · [{e.indicadoresSeleccionados.join(',')}]</p>
              </div>
              <button onClick={async () => { const inst = instrumentaciones.find((x) => x.id === asignaturas.find((y) => y.id === e.asignaturaId)?.instrumentacionId); const b = await generarEvidenciaPDF(e, mapaDeIndicadores(e, inst)); descargarPDF(b, `FO-205P11000-14_${e.nombreEvidencia.slice(0, 30)}`) }} className="touch-btn ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-emerald-400 px-3 font-bold text-slate-950" title="Descargar PDF">
                <Icon name="download" size={15} /> PDF
              </button>
              <button onClick={() => empezarEdicion(e)} className="touch-btn shrink-0 rounded-lg t-surface2 px-3" title="Editar">Editar</button>
              <button onClick={() => setEliminarId(e.id)} className="touch-btn shrink-0 rounded-lg bg-red-500/20 px-2 text-red-200" title="Eliminar evidencia" aria-label="Eliminar evidencia">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          {lista.length === 0 && asignaturas.length > 0 && <p className="text-sm t-muted">Sin evidencias. Crea la primera con Nueva (wizard de 3 pasos).</p>}
        </div>
      </section>
      {eliminarId && (
        <ConfirmDialog
          titulo="¿Eliminar evidencia?"
          mensaje="Esta acción no se puede deshacer."
          onCancel={() => setEliminarId(null)}
          onConfirm={() => { db.evidencias.delete(eliminarId).then(recargar); setEliminarId(null) }}
        />
      )}
      {importando && (
        <ImportarPdfModal
          perfil={perfil} asignaturas={asignaturas} instrumentaciones={instrumentaciones} inicialAsigId={filtro}
          onCancel={() => setImportando(false)}
          onGuardado={() => { setImportando(false); recargar() }}
        />
      )}
      {corrigiendo && (
        <CorregirImportadaModal
          evidencia={corrigiendo}
          competencias={instrumentaciones.find((i) => i.id === asignaturas.find((a) => a.id === corrigiendo.asignaturaId)?.instrumentacionId)?.competencias ?? []}
          onCancel={() => setCorrigiendo(null)}
          onGuardado={() => { setCorrigiendo(null); recargar() }}
        />
      )}
      {vistaPdf && <PreviewModal bytes={vistaPdf.bytes} nombre={vistaPdf.nombre} onClose={() => setVistaPdf(null)} />}
    </div>
  )
}

/** Agrega un PDF ya entregado: se guarda íntegro, solo se capturan nombre y competencia. */
function ImportarPdfModal({ perfil, asignaturas, instrumentaciones, inicialAsigId, onCancel, onGuardado }: {
  perfil: Alumno; asignaturas: AsignaturaMeta[]; instrumentaciones: Instrumentacion[];
  inicialAsigId: string; onCancel: () => void; onGuardado: () => void
}) {
  const [asigId, setAsigId] = useState(inicialAsigId || asignaturas[0]?.id || '')
  const [nombre, setNombre] = useState('')
  const [comp, setComp] = useState('')
  const [archivo, setArchivo] = useState<{ nombre: string; mb: number; paginas: number; base64: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)
  const asig = asignaturas.find((a) => a.id === asigId)
  const inst = instrumentaciones.find((i) => i.id === asig?.instrumentacionId)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])

  const elegir = async (f: File) => {
    setMsg('Leyendo PDF…')
    setArchivo(null)
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      const cab = new TextDecoder().decode(buf.slice(0, 5))
      if (cab !== '%PDF-') { setMsg('El archivo no parece un PDF válido.'); return }
      const src = await PDFDocument.load(buf)
      setArchivo({ nombre: f.name, mb: buf.length / 1048576, paginas: src.getPageCount(), base64: bytesABase64(buf) })
      if (!nombre) setNombre(f.name.replace(/\.pdf$/i, '').slice(0, 80))
      setMsg('')
    } catch {
      setMsg('No se pudo leer el PDF.')
    }
  }

  const guardar = async () => {
    if (!asig) { setMsg('Elige la materia.'); return }
    if (!nombre.trim()) { setMsg('Escribe el nombre de la actividad.'); return }
    if (!comp.trim()) { setMsg('Indica la competencia.'); return }
    if (!archivo) { setMsg('Elige el archivo PDF.'); return }
    setGuardando(true)
    try {
      const ahora = Date.now()
      await db.evidencias.put({
        id: uid(), asignaturaId: asig.id, origen: 'pdf',
        pdfBase64: archivo.base64, pdfPaginas: archivo.paginas,
        division: perfil.division, grupo: asig.grupo || perfil.grupo,
        asignatura: asig.nombre, docente: asig.docente,
        alumnoNombre: perfil.nombreCompleto, numeroControl: perfil.numeroControl,
        integrantes: [], fechaEntrega: '', competenciaNo: comp.trim(),
        descripcionCompetencia: inst?.competencias.find((c) => c.numero === comp.trim())?.descripcion ?? '',
        indicadoresSeleccionados: [], nombreEvidencia: nombre.trim(),
        bloques: [], creadaEn: ahora, actualizadaEn: ahora,
      })
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/70 p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Importar PDF entregado">
      <div className="t-modal mx-auto max-w-xl rounded-2xl border t-line p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold tick">Importar PDF entregado</h3>
        <p className="text-sm t-muted">Se guarda tal cual se entregó (no editable). Solo importa trabajos propios o con consentimiento.</p>
        <div className="mt-3 grid gap-2">
          <label className={`${btnSec} flex cursor-pointer items-center gap-2 text-sm`}>
            <Icon name="upload" size={15} /> {archivo ? archivo.nombre : 'Elegir PDF'}
            <input type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="Elegir archivo PDF" onChange={(e) => { const f = e.target.files?.[0]; if (f) elegir(f); e.target.value = '' }} />
          </label>
          {archivo && (
            <p className="text-xs t-muted">{archivo.paginas} págs. · {archivo.mb.toFixed(1)} MB{archivo.mb > 25 ? ' · pesado, el portafolio puede tardar en generarse' : ''}</p>
          )}
          <label className="grid gap-1 text-sm font-medium">Materia
            <select value={asigId} onChange={(e) => setAsigId(e.target.value)} className={campo}>
              {asignaturas.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Nombre de la actividad
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} placeholder="Aparece en el índice del portafolio" />
          </label>
          <label className="grid gap-1 text-sm font-medium">Competencia
            <input value={comp} onChange={(e) => setComp(e.target.value)} className={campo} placeholder="Núm. de competencia" list="comps-importar" />
            <datalist id="comps-importar">
              {inst?.competencias.map((c) => <option key={c.numero} value={c.numero}>{c.descripcion.slice(0, 60)}</option>)}
            </datalist>
          </label>
        </div>
        {msg && <p role="status" className="mt-2 text-sm text-amber-200">{msg}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={guardar} disabled={guardando} className={`${btnPri} flex items-center gap-2`}><Icon name="check" size={15} /> {guardando ? 'Guardando…' : 'Agregar'}</button>
          <button onClick={onCancel} className={btnSec}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

/** Corrige nombre y competencia de un PDF importado (el contenido no cambia). */
function CorregirImportadaModal({ evidencia, competencias, onCancel, onGuardado }: {
  evidencia: Evidencia; competencias: Competencia[]; onCancel: () => void; onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(evidencia.nombreEvidencia)
  const [comp, setComp] = useState(evidencia.competenciaNo)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])

  const guardar = async () => {
    if (!nombre.trim()) { setMsg('Escribe el nombre de la actividad.'); return }
    if (!comp.trim()) { setMsg('Indica la competencia.'); return }
    await db.evidencias.update(evidencia.id, {
      nombreEvidencia: nombre.trim(), competenciaNo: comp.trim(),
      descripcionCompetencia: competencias.find((c) => c.numero === comp.trim())?.descripcion ?? evidencia.descripcionCompetencia,
      actualizadaEn: Date.now(),
    })
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/70 p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Corregir datos del PDF">
      <div className="t-modal mx-auto max-w-md rounded-2xl border t-line p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold tick">Corregir datos</h3>
        <p className="text-sm t-muted">Solo nombre y competencia. El PDF no cambia.</p>
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-sm font-medium">Nombre de la actividad
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
          <label className="grid gap-1 text-sm font-medium">Competencia
            <input value={comp} onChange={(e) => setComp(e.target.value)} className={campo} list="comps-corregir" />
            <datalist id="comps-corregir">
              {competencias.map((c) => <option key={c.numero} value={c.numero}>{c.descripcion.slice(0, 60)}</option>)}
            </datalist>
          </label>
        </div>
        {msg && <p role="status" className="mt-2 text-sm text-amber-200">{msg}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={guardar} className={`${btnPri} flex items-center gap-2`}><Icon name="check" size={15} /> Guardar</button>
          <button onClick={onCancel} className={btnSec}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
