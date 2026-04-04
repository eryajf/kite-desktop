function App() {
  return (
    <main className="shell">
      <span className="shell__badge">Kite Desktop Shell</span>
      <h1 className="shell__title">Kite</h1>
      <p className="shell__lead">
        Launching the embedded backend and attaching native desktop services.
      </p>
      <div className="shell__status">
        <span className="shell__dot" />
        Ready to proxy the local Kite UI.
      </div>
    </main>
  )
}

export default App
