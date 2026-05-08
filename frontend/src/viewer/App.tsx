import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from '../components/shared/ErrorBoundary'
import { MatchPage } from './MatchPage'

export function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 flex-col gap-4">
          <span className="text-3xl">⚡</span>
          <p className="text-white font-semibold">Something went wrong</p>
          <p className="text-sm max-w-sm text-center">{err.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
          >
            Try again
          </button>
        </div>
      )}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 flex-col gap-4">
      <span className="text-4xl">⚡</span>
      <p className="text-lg font-semibold text-white">Killswitch</p>
      <p className="text-sm">Open a match link to watch a live match.</p>
    </div>
  )
}
