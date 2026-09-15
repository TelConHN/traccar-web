// Cliente del servicio de Transporte.
//
// Transporte es otro servicio, con sus propias pantallas, pero su API cuelga del mismo prefijo que
// Rutas (/api/rutas/transporte): la cookie de sesión de Traccar viaja sola y Nginx no necesita un
// bloque nuevo.
import { cabeceraClienteAdmin } from '../servicios/clienteAdmin';

const BASE = '/api/rutas/transporte';

// El servicio devuelve los errores como { error: "texto para la persona" }. Sin esto, el usuario
// vería el JSON crudo en pantalla.
//
// Cada petición lleva el cliente que eligió un administrador, si eligió uno (ver
// servicios/clienteAdmin.js).
const pedir = async (ruta, opciones = {}) => {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...cabeceraClienteAdmin() },
  });
  if (!respuesta.ok) {
    let mensaje = await respuesta.text();
    try {
      mensaje = JSON.parse(mensaje).error ?? mensaje;
    } catch {
      /* el cuerpo no era JSON: se muestra tal cual */
    }
    throw new Error(mensaje);
  }
  return respuesta.status === 204 ? null : respuesta.json();
};

const transporteApi = {
  perfil: () => pedir('/perfil'),
  // Qué tipo de transporte maneja la cuenta: escolar, personal, linea u otro.
  configurar: (operacion) =>
    pedir('/configuracion', { method: 'PUT', body: JSON.stringify({ operacion }) }),
};

export default transporteApi;
