import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MatchPage } from './MatchPage'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
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
