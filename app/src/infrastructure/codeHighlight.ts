// Resaltado de sintaxis offline (highlight.js): python, java, c, sql.
// Expone tokens con color para el PDF y HTML para la UI.

import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import sql from 'highlight.js/lib/languages/sql'
import type { LenguajeCodigo } from '../domain/types'

hljs.registerLanguage('python', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('c', c)
hljs.registerLanguage('sql', sql)

export interface Token {
  texto: string
  color: string // hex
  bold?: boolean
}

// Paleta sobria legible sobre fondo oscuro (UI) y adaptable a PDF claro.
const COLOR_POR_CLASE: Record<string, string> = {
  keyword: '#c792ea',
  built_in: '#82aaff',
  literal: '#ff5874',
  number: '#f78c6c',
  string: '#c3e88d',
  comment: '#697098',
  title: '#ffcb6b',
  'title.function_': '#ffcb6b',
  params: '#eeffff',
  attr: '#addb67',
  attribute: '#addb67',
  name: '#ff5874',
  selector: '#ff5874',
  operator: '#89ddff',
  punctuation: '#89ddff',
  type: '#ffcb6b',
  class: '#ffcb6b',
  variable: '#eeffff',
  template: '#c3e88d',
}

const COLOR_PDF: Record<string, string> = {
  keyword: '#1a237e',
  built_in: '#0d47a1',
  literal: '#b71c1c',
  number: '#e65100',
  string: '#1b5e20',
  comment: '#616161',
  title: '#4a148c',
  'title.function_': '#4a148c',
  params: '#212121',
  attr: '#33691e',
  attribute: '#33691e',
  name: '#b71c1c',
  selector: '#b71c1c',
  operator: '#01579b',
  punctuation: '#424242',
  type: '#4a148c',
  class: '#4a148c',
  variable: '#212121',
  template: '#1b5e20',
}

function htmlAHtmlSeguro(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function resaltarHTML(codigo: string, lenguaje: LenguajeCodigo): string {
  if (lenguaje === 'texto') return htmlAHtmlSeguro(codigo)
  try {
    return hljs.highlight(codigo, { language: lenguaje }).value
  } catch {
    return htmlAHtmlSeguro(codigo)
  }
}

/** Convierte el HTML de hljs a tokens planos con color (para pdf-lib). */
export function resaltarTokens(codigo: string, lenguaje: LenguajeCodigo, paraPDF = true): Token[] {
  const paleta = paraPDF ? COLOR_PDF : COLOR_POR_CLASE
  const base = paraPDF ? '#212121' : '#e6edf3'
  if (lenguaje === 'texto') return [{ texto: codigo, color: base }]
  let html: string
  try {
    html = hljs.highlight(codigo, { language: lenguaje }).value
  } catch {
    return [{ texto: codigo, color: base }]
  }
  // Recorre los spans anidados con pila (la clase interna prevalece).
  const tokens: Token[] = []
  const pila: string[] = [base]
  const re = /<span class="hljs-([^"]+)">|<\/span>|([^<>]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      const clase = m[1].split(' ')[0]
      pila.push(paleta[clase] ?? pila[pila.length - 1])
    } else if (m[0] === '</span>') {
      if (pila.length > 1) pila.pop()
    } else if (m[2] !== undefined) {
      tokens.push({ texto: desentidades(m[2]), color: pila[pila.length - 1], bold: false })
    }
  }
  return tokens.length ? tokens : [{ texto: codigo, color: base }]
}

function desentidades(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
}

/** Divide tokens por saltos de línea para dibujar línea por línea. */
export function tokensPorLinea(tokens: Token[]): Token[][] {
  const lineas: Token[][] = [[]]
  for (const tk of tokens) {
    const partes = tk.texto.split('\n')
    partes.forEach((p, i) => {
      if (i > 0) lineas.push([])
      if (p) lineas[lineas.length - 1].push({ ...tk, texto: p })
    })
  }
  return lineas
}
