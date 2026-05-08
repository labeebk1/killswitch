import type { ToolUseBlock } from '../../types/match-state'

interface Props {
  block: ToolUseBlock
}

const TOOL_ICONS: Record<string, string> = {
  read_file: '📄',
  write_file: '✏️',
  bash: '⚡',
  list_files: '📁',
  search_files: '🔍',
}

function icon(toolName: string) {
  return TOOL_ICONS[toolName] ?? '🔧'
}

export function ToolUsePill({ block }: Props) {
  if (block.type === 'tool_started') {
    return (
      <div className="flex items-center gap-2 my-1 px-3 py-1.5 rounded-full bg-slate-700/60 text-xs text-slate-300 animate-pulse w-fit max-w-full">
        <span>{icon(block.toolName)}</span>
        <span className="font-mono truncate">{block.toolName}</span>
        <span className="text-slate-500">running…</span>
      </div>
    )
  }

  const okColor = block.ok ? 'text-emerald-400' : 'text-red-400'
  return (
    <div
      className={`flex items-center gap-2 my-1 px-3 py-1.5 rounded-full bg-slate-700/40 text-xs w-fit max-w-full ${
        block.ok ? 'border border-slate-600' : 'border border-red-800'
      }`}
    >
      <span>{icon(block.toolName)}</span>
      <span className={`font-mono truncate ${okColor}`}>{block.summary}</span>
      {block.durationMs !== undefined && (
        <span className="text-slate-500 shrink-0">{(block.durationMs / 1000).toFixed(1)}s</span>
      )}
    </div>
  )
}
