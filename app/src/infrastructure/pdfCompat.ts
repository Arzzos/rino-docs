// Compatibilidad de pdf.js con Safari/iOS anteriores a 17.4: el motor usa
// Promise.withResolvers() al cargar. El polyfill se registra antes de importar
// pdf.js y también dentro del worker, que corre en su propio ámbito.

interface PromiseConResolvers {
  withResolvers?<T>(): {
    promise: Promise<T>
    resolve: (valor: T | PromiseLike<T>) => void
    reject: (motivo?: unknown) => void
  }
}

export function asegurarPolyfillsPdf(): void {
  const P = Promise as unknown as PromiseConResolvers
  if (typeof P.withResolvers === 'function') return
  P.withResolvers = function <T>() {
    let resolver!: (valor: T | PromiseLike<T>) => void
    let rechazar!: (motivo?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolver = res
      rechazar = rej
    })
    return { promise, resolve: resolver, reject: rechazar }
  }
}

asegurarPolyfillsPdf()
