import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="min-h-screen bg-orange-50 px-6 py-20 text-stone-900">
      <section className="mx-auto max-w-2xl border-l-4 border-orange-700 pl-8">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
          Operaciones
        </p>
        <h1 className="text-5xl font-bold tracking-tight">Nuvio Admin</h1>
        <p className="mt-6 text-xl leading-8">Página inicial de administración.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
