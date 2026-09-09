'use client'

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import { XIcon } from 'lucide-react'
import { agregarEtiquetas } from '@/lib/domain/etiquetas'
import { cn } from '@/lib/utils'

/**
 * Lista de etiquetas que se captura tecleando: Enter o coma agregan, Backspace
 * con el campo vacío quita la última, pegar "a, b\nc" reparte en tres. El
 * valor SIEMPRE es `string[]`: quien lo usa no vuelve a partir texto.
 */
export function EtiquetasInput({
  id,
  valor,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string
  valor: string[]
  onChange: (valor: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [texto, setTexto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function confirmar(raw = texto) {
    if (!raw.trim()) {
      setTexto('')
      return
    }
    onChange(agregarEtiquetas(valor, raw))
    setTexto('')
  }

  function quitar(i: number) {
    onChange(valor.filter((_, j) => j !== i))
    inputRef.current?.focus()
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter no manda el formulario: aquí agrega la etiqueta.
      e.preventDefault()
      confirmar()
    } else if (e.key === 'Backspace' && texto === '' && valor.length) {
      e.preventDefault()
      quitar(valor.length - 1)
    }
  }

  function pegar(e: ClipboardEvent<HTMLInputElement>) {
    const pegado = e.clipboardData.getData('text')
    if (/[,\n]/.test(pegado)) {
      e.preventDefault()
      confirmar(`${texto} ${pegado}`)
    }
  }

  return (
    // El contenedor recibe el clic para enfocar el input, como un campo normal.
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 text-sm shadow-xs',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        disabled && 'opacity-50'
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {valor.map((e, i) => (
        <span
          key={`${e}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm text-foreground"
        >
          {e}
          <button
            type="button"
            aria-label={`Quitar ${e}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            disabled={disabled}
            onClick={(ev) => {
              ev.stopPropagation()
              quitar(i)
            }}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={texto}
        disabled={disabled}
        placeholder={valor.length ? '' : placeholder}
        className="min-w-32 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={teclas}
        onPaste={pegar}
        // Lo que quedó tecleado sin confirmar no se pierde al salir del campo.
        onBlur={() => confirmar()}
      />
    </div>
  )
}
