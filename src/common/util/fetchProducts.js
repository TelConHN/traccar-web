// Productos para mostrar su nombre en vez del código del lector. Como con los conductores, un
// administrador trae todos. Si el servidor todavía no tiene productos (migración sin correr) no se
// muestra un error a cada persona que entra: la lista queda vacía.
export default async (administrator) => {
  try {
    const response = await fetch(administrator ? '/api/products?all=true' : '/api/products');
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
};
