import { Component } from 'react'

// The recovery route never imports the redesigned workspace chunk.
export default class AdminWorkspaceBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">The workspace could not be opened</h1><p className="my-4 text-sm">Your sign-in is still available. Continue using classic admin.</p><a className="rounded-lg bg-blue-600 px-4 py-3 text-white" href="/admin/classic">Return to classic admin</a></main>
    return this.props.children
  }
}
