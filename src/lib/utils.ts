import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// La paleta de la home (ADR-0046) agrega tokens que tailwind-merge no conoce.
// Sin enseñárselos, `cn('text-lead', 'text-mid')` tira `text-lead` creyendo
// que son dos tamaños: el hero salía con el párrafo a 16 px en vez de 20.
// Solo suma nombres; la resolución de todo lo demás no cambia.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display-lg", "display-md", "heading", "subheading", "lead", "body", "small", "caption"],
      color: [
        "canvas", "surface-1", "surface-2", "hairline", "hairline-strong", "hi", "mid", "low", "signal", "alert",
        "jade-50", "jade-100", "jade-200", "jade-300", "jade-400", "jade-500",
        "jade-600", "jade-700", "jade-800", "jade-900", "jade-950",
      ],
      radius: ["card", "panel", "pill"],
      spacing: ["section", "section-lg"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
