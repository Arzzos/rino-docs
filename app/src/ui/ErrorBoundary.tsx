import { Component, type ReactNode } from 'react'
import Icon from './icons'

interface Estado {
  error: Error | null
}

interface Props {
  children: ReactNode
  /** Etiqueta de contexto para el reporte (pestaña o visor). */
  nombre?: string
  /** Contenido compacto para fallos contenidos (visor). */
  compacto?: boolean
  /** Acción alternativa en el fallback (p. ej. Descargar). */
  accion?: ReactNode
}

/** Evita pantalla en blanco ante registros corruptos o fallos de render. */
export default class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[RinoDocs]', this.props.nombre ?? 'vista', error)
    try {
      const detalle = {
        donde: this.props.nombre ?? 'vista',
        nombre: error.name,
        mensaje: error.message,
        pila: (error.stack ?? '').split('\n').slice(0, 6).join('\n'),
        agente: navigator.userAgent,
        url: location.href,
        cuando: new Date().toISOString(),
      }
      localStorage.setItem('rino.ultimo-error', JSON.stringify(detalle))
    } catch { /* almacenamiento no disponible */ }
  }

  private copiar = async () => {
    const e = this.state.error
    if (!e) return
    try {
      await navigator.clipboard.writeText(
        `[RinoDocs] ${this.props.nombre ?? 'vista'}\n${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 8).join('\n')}\n${navigator.userAgent}`,
      )
    } catch { /* portapapeles no disponible */ }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const detalle = `${error.name}: ${error.message}`
    if (this.props.compacto) {
      return (
        <div className="p-4 text-sm" role="alert">
          <p className="flex items-center gap-2 font-bold text-slate-700"><Icon name="alert" size={16} /> No se pudo mostrar aquí</p>
          <p className="mt-1 break-words text-xs text-slate-500">{detalle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {this.props.accion}
            <button onClick={() => this.setState({ error: null })} className="touch-btn flex items-center gap-1 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700"><Icon name="rotate" size={15} /> Reintentar</button>
            <button onClick={this.copiar} className="touch-btn flex items-center gap-1 rounded-xl t-surface2 px-4"><Icon name="copy" size={15} /> Copiar detalles</button>
          </div>
        </div>
      )
    }
    return (
      <div className="aviso aviso-bad mx-auto max-w-xl p-6 text-center" role="alert">
        <p className="text-lg font-bold">Algo falló al mostrar esta vista</p>
        <p className="mt-2 text-sm t-muted">Tus datos están a salvo. Intenta de nuevo.</p>
        <p className="mx-auto mt-2 max-w-md break-words text-xs opacity-70 t-muted">{detalle}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="touch-btn flex items-center gap-1 rounded-xl bg-[var(--ok-bg)] px-5 font-bold text-[var(--ok-ink)]" onClick={() => this.setState({ error: null })}><Icon name="rotate" size={15} /> Reintentar</button>
          <button className="touch-btn flex items-center gap-1 rounded-xl t-surface2 px-5 font-semibold" onClick={this.copiar}><Icon name="copy" size={15} /> Copiar detalles</button>
          <button className="touch-btn rounded-xl t-surface2 px-5" onClick={() => window.location.reload()}>Recargar app</button>
        </div>
      </div>
    )
  }
}
