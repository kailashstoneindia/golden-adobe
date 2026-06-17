export default function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#0f172a',
        color: '#f1f5f9',
        gap: '12px',
      }}
    >
      <h1
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          margin: 0,
        }}
      >
        🏠 Golden Abode Admin
      </h1>
      <p
        style={{
          color: '#94a3b8',
          margin: 0,
        }}
      >
        Admin panel UI ships in Phase 4.
      </p>
      <code
        style={{
          background: '#1e293b',
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '0.85rem',
        }}
      >
        @golden-abode/admin — scaffolded ✓
      </code>
    </div>
  );
}
