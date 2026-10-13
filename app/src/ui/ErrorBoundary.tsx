import { Component, type ReactNode } from 'react'

interface Estado { error: Error | null }

/** Evita pantalla en blanco ante registros corruptos o fallos de render. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[RinoDocs]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
          <p className="text-lg font-bold text-red-200">Algo falló al mostrar esta vista</p>
          <p className="mt-2 text-sm t-muted">Tus datos están a salvo. Intenta de nuevo.</p>
          <button
            className="touch-btn mt-4 rounded-xl t-surface2 px-5 font-semibold"
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
