/**
 * URL base de la API externa (Function App).
 * Inyectada como VITE_API_URL en el build de despliegue (US-051);
 * vacío en desarrollo hasta que exista un backend local configurado.
 * Dormido a propósito: ningún componente llama a la API todavía;
 * el primer consumidor real usará esta constante.
 */
export const apiBaseUrl: string = import.meta.env.VITE_API_URL ?? '';
