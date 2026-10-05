import fetchOrThrow from './fetchOrThrow';

// Conductores para mostrar su nombre en vez del código que manda el lector (iButton/RFID).
// Un administrador trae TODOS: si no, solo los vinculados a su cuenta y el conductor que creó un
// cliente le salía con el código. Se usa al entrar y al guardar un conductor.
export default async (administrator) => {
  const response = await fetchOrThrow(administrator ? '/api/drivers?all=true' : '/api/drivers');
  return response.json();
};
