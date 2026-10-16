// Iconos Lucide + marcas propias en SVG (GitHub/Instagram).
import {
  Archive, ArrowLeft, ArrowRight, BookOpen, Camera, Check, ChevronDown, ChevronUp,
  Code2, Copy, Download, Eye, FileText, Globe, Image as ImageIcon, Link2, Moon,
  Plus, RotateCw, Settings2, Shield, Sun, Table2, Text, Trash2, TriangleAlert, Type,
  Upload, User, X, type LucideIcon,
} from 'lucide-react'
import type { SVGProps } from 'react'

function trazo(props: SVGProps<SVGSVGElement>, path: string) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  )
}

const GithubPropio = (p: SVGProps<SVGSVGElement>) =>
  trazo(p, '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.9 3.9 0 0 0-1.1-2.7c3.6-.4 7.4-1.8 7.4-8a5.8 5.8 0 0 0-1.6-4 5.4 5.4 0 0 0-.1-4s-1.3-.4-4.2 1.6a12.4 12.4 0 0 0-7.6 0C6.3 2.9 5 3.3 5 3.3a5.4 5.4 0 0 0-.1 4 5.8 5.8 0 0 0-1.6 4c0 6.2 3.8 7.6 7.4 8a3.9 3.9 0 0 0-1.1 2.7V19"/>')

const InstaPropio = (p: SVGProps<SVGSVGElement>) =>
  trazo(p, '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5"/>')

const MAPA = {
  user: User,
  book: BookOpen,
  doc: FileText,
  box: Archive,
  plus: Plus,
  upload: Upload,
  download: Download,
  eye: Eye,
  trash: Trash2,
  up: ChevronUp,
  down: ChevronDown,
  x: X,
  copy: Copy,
  check: Check,
  rotate: RotateCw,
  image: ImageIcon,
  table: Table2,
  code: Code2,
  text: Text,
  title: Type,
  link: Link2,
  alert: TriangleAlert,
  left: ArrowLeft,
  right: ArrowRight,
  sliders: Settings2,
  external: Link2,
  globe: Globe,
  shield: Shield,
  spark: Settings2,
  sun: Sun,
  moon: Moon,
  camera: Camera,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof MAPA | 'github' | 'insta'

/** Monograma Rino minimalista: R de un solo trazo continuo (sin cruces ni
 *  empalmes) + corte de cuerno flotante con aire. Una sola tinta del contexto.
 *  A 16px se lee R. */
export function MarcaRD({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Rino Docs"
      fill="none" stroke="currentColor" strokeWidth={3.4}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M21.5 29L16 18H10V8h6a5 5 0 0 1 0 10H10V29" />
      <path d="M20.5 4.2L25.5 2" />
    </svg>
  )
}

export default function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  if (name === 'github') return <GithubPropio width={size} height={size} className={`shrink-0 ${className}`} />
  if (name === 'insta') return <InstaPropio width={size} height={size} className={`shrink-0 ${className}`} />
  const C = MAPA[name as keyof typeof MAPA]
  return <C size={size} className={`shrink-0 ${className}`} aria-hidden="true" />
}
