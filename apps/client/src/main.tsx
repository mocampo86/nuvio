import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { healthResponseSchema } from '@nuvio/shared';
import './styles.css';

const healthResponse = healthResponseSchema.parse({
  status: 'ok',
  service: 'nuvio-api'
});

function App() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-20 text-stone-900">
      <section className="mx-auto max-w-2xl border-l-4 border-teal-700 pl-8">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Reservas simples
        </p>
        <h1 className="text-5xl font-bold tracking-tight">Nuvio</h1>
        <p className="mt-6 text-xl leading-8">Bienvenido a Nuvio, tu próximo turno empieza acá.</p>
        <p className="mt-3 text-stone-600">Esta es la aplicación para clientes.</p>
        <p className="mt-8 text-sm text-stone-500">Servicio compartido: {healthResponse.service}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
