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
    let cuerpo = null;
    try {
      cuerpo = JSON.parse(mensaje);
      mensaje = cuerpo.error ?? mensaje;
    } catch {
      /* el cuerpo no era JSON: se muestra tal cual */
    }
    // El código y el detalle viajan con el error: un choque de horarios (409) trae con qué chocó.
    throw Object.assign(new Error(mensaje), { estado: respuesta.status, cuerpo });
  }
  return respuesta.status === 204 ? null : respuesta.json();
};

const enviar = (metodo, ruta, cuerpo) =>
  pedir(ruta, { method: metodo, body: JSON.stringify(cuerpo ?? {}) });

const consulta = (params) => {
  const limpios = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const q = new URLSearchParams(limpios).toString();
  return q ? `?${q}` : '';
};

const transporteApi = {
  perfil: () => pedir('/perfil'),
  // Qué tipo de transporte maneja la cuenta: escolar, personal, linea u otro.
  configurar: (operacion) => enviar('PUT', '/configuracion', { operacion }),

  // ── Recorridos (fase 3) ──────────────────────────────────────────────────
  lineas: () => pedir('/lineas'),
  linea: (id) => pedir(`/lineas/${id}`),
  // Los viajes que hizo un bus un día, ya cortados: para elegir cuál grabar.
  viajes: (deviceId, fecha) => pedir(`/lineas/viajes${consulta({ deviceId, fecha })}`),
  ajustar: (datos) => enviar('POST', '/lineas/ajustar', datos),
  proponerParadas: (datos) => enviar('POST', '/lineas/proponer-paradas', datos),
  trazar: (puntos) => enviar('POST', '/lineas/trazar', { puntos }),
  acomodarPunto: (puntos, indice) => enviar('POST', '/lineas/acomodar', { puntos, indice }),
  importar: (texto) => enviar('POST', '/lineas/importar', { texto }),
  crearLinea: (datos) => enviar('POST', '/lineas', datos),
  editarLinea: (id, datos) => enviar('PUT', `/lineas/${id}`, datos),
  borrarLinea: (id) => pedir(`/lineas/${id}`, { method: 'DELETE' }),
  editarVariante: (id, vid, datos) => enviar('PUT', `/lineas/${id}/variantes/${vid}`, datos),
  cortarVariante: (id, vid, donde) =>
    enviar('POST', `/lineas/${id}/variantes/${vid}/cortar`, donde),
  agregarParada: (id, vid, datos) =>
    enviar('POST', `/lineas/${id}/variantes/${vid}/paradas`, datos),
  editarParada: (id, pid, datos) => enviar('PUT', `/lineas/${id}/paradas/${pid}`, datos),
  borrarParada: (id, pid) => pedir(`/lineas/${id}/paradas/${pid}`, { method: 'DELETE' }),

  // Velocidad por tramo (fase 7) y cambios propuestos (fase 8).
  tramos: (id, vid) => pedir(`/lineas/${id}/variantes/${vid}/tramos`),
  guardarTramos: (id, vid, tramos) =>
    enviar('PUT', `/lineas/${id}/variantes/${vid}/tramos`, { tramos }),
  propuestas: (id, vid) => pedir(`/lineas/${id}/variantes/${vid}/propuestas`),
  aplicarPropuesta: (id, vid, datos) =>
    enviar('POST', `/lineas/${id}/variantes/${vid}/propuestas/aplicar`, datos),

  // ── Horarios y viajes (fases 4 y 5) ──────────────────────────────────────
  turnos: () => pedir('/turnos'),
  diaDelBus: (deviceId, fecha) => pedir(`/turnos/dia${consulta({ deviceId, fecha })}`),
  crearTurno: (datos) => enviar('POST', '/turnos', datos),
  editarTurno: (id, datos) => enviar('PUT', `/turnos/${id}`, datos),
  borrarTurno: (id) => pedir(`/turnos/${id}`, { method: 'DELETE' }),
  viajesDelDia: (fecha) => pedir(`/viajes${consulta({ fecha })}`),
  viaje: (id) => pedir(`/viajes/${id}`),
  viajesMios: (fecha) => pedir(`/viajes/mios${consulta({ fecha })}`),
  hoy: () => pedir('/hoy'),
  autorizarDesvio: (viajeId, desvioId, datos) =>
    enviar('POST', `/viajes/${viajeId}/desvios/${desvioId}/autorizar`, datos),
  descartarDesvio: (viajeId, desvioId, datos) =>
    enviar('POST', `/viajes/${viajeId}/desvios/${desvioId}/descartar`, datos),
  autorizaciones: () => pedir('/autorizaciones'),
  levantarAutorizacion: (id) => pedir(`/autorizaciones/${id}`, { method: 'DELETE' }),
  alertas: (desde, hasta) => pedir(`/alertas${consulta({ desde, hasta })}`),
  equipos: () => pedir('/equipos'),
  reportes: (desde, hasta) => pedir(`/reportes${consulta({ desde, hasta })}`),

  // ── Pasajeros, grupos y enlaces (fase 6) ─────────────────────────────────
  grupos: () => pedir('/grupos'),
  crearGrupo: (datos) => enviar('POST', '/grupos', datos),
  editarGrupo: (id, datos) => enviar('PUT', `/grupos/${id}`, datos),
  borrarGrupo: (id) => pedir(`/grupos/${id}`, { method: 'DELETE' }),
  pasajeros: () => pedir('/pasajeros'),
  opcionesPasajero: () => pedir('/pasajeros/opciones'),
  crearPasajero: (datos) => enviar('POST', '/pasajeros', datos),
  editarPasajero: (id, datos) => enviar('PUT', `/pasajeros/${id}`, datos),
  borrarPasajero: (id) => pedir(`/pasajeros/${id}`, { method: 'DELETE' }),
  importarPasajeros: (filas) => enviar('POST', '/pasajeros/importar', { filas }),
  enlaces: () => pedir('/enlaces'),
  crearEnlace: (datos) => enviar('POST', '/enlaces', datos),
  regenerarEnlace: (id) => enviar('POST', `/enlaces/${id}/regenerar`),
  revocarEnlace: (id) => enviar('POST', `/enlaces/${id}/revocar`),
  configurarAbordaje: (activo) => enviar('PUT', '/configuracion/abordaje', { activo }),
  abordaje: (viajeId) => pedir(`/viajes/${viajeId}/abordaje`),
  marcarAbordaje: (viajeId, pasajeroId, estado) =>
    enviar('POST', `/viajes/${viajeId}/abordaje`, { pasajeroId, estado }),
};

/// La página pública de seguimiento. Va sin cabecera de cliente ni sesión: `fetch` directo.
export const seguirPublico = async (codigo) => {
  const r = await fetch(`/api/rutas/seguir/${encodeURIComponent(codigo)}`, { credentials: 'omit' });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(new Error(cuerpo.error ?? 'No se pudo cargar.'), { estado: r.status });
  return cuerpo;
};

export default transporteApi;
