import { useEffect, useRef } from 'react'
import type { Turn } from '../../types/match-state'
import { ToolUsePill } from './ToolUsePill'

interface Props {
  turn: Turn
  isActive: boolean
}

export function ResponseStream({ turn, isActive }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [turn.responseBlocks, isActive])

  if (turn.responseBlocks.length === 0 && !isActive) return null

  return (
    <div className="response-stream text-sm text-slate-200 space-y-1">
      {turn.responseBlocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p key={i} className="leading-relaxed whitespace-pre-wrap break-words">
              {block.text}
            </p>
          )
        }
        return <ToolUsePill key={block.toolUseId} block={block} />
      })}
      {isActive && turn.responseBlocks.length === 0 && (
        <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse align-middle" />
      )}
      <div ref={endRef} />
    </div>
  )
}
