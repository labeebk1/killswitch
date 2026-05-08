import type { Turn } from '../../types/match-state'
import { ResponseStream } from './ResponseStream'

interface Props {
  turns: Turn[]
  activeTurnId?: string
}

export function PromptTranscript({ turns, activeTurnId }: Props) {
  if (turns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Waiting for first prompt…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-3 py-3">
      {turns.map((turn) => (
        <div key={turn.turnId} className="space-y-2">
          {/* Prompt bubble */}
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-indigo-600/70 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 break-words">
              {turn.promptText}
            </div>
          </div>

          {/* Response */}
          <ResponseStream turn={turn} isActive={turn.turnId === activeTurnId} />
        </div>
      ))}
    </div>
  )
}
