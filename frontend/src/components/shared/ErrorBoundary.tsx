import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset)
      }
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 p-4">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm text-center max-w-xs break-words">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
