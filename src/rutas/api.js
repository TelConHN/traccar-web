// Cliente del módulo de Rutas.
//
// Vive detrás del mismo dominio que Traccar, así que la cookie de sesión viaja sola: no hay
// token que guardar ni login aparte. Nginx manda /api/rutas/ al servicio.
const BASE = '/api/rutas';

// El servicio devuelve los errores como { error: "texto para la persona" }. Sin esto, el
// usuario vería el JSON crudo en pantalla.
const pedir = async (ruta, opciones = {}) => {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
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

const enviar = (metodo, ruta, cuerpo) =>
  pedir(ruta, { method: metodo, body: JSON.stringify(cuerpo ?? {}) });

const rutasApi = {
  perfil: () => pedir('/perfil'),
  crearConductor: (datos) => enviar('POST', '/conductores', datos),
  editarConductor: (id, datos) => enviar('PUT', `/conductores/${id}`, datos),
  borrarConductor: (id) => pedir(`/conductores/${id}`, { method: 'DELETE' }),

  puntos: () => pedir('/puntos'),
  crearPunto: (punto) => enviar('POST', '/puntos', punto),
  editarPunto: (id, cambios) => enviar('PATCH', `/puntos/${id}`, cambios),
  borrarPunto: (id) => pedir(`/puntos/${id}`, { method: 'DELETE' }),

  plantillas: () => pedir('/plantillas'),
  crearPlantilla: (plantilla) => enviar('POST', '/plantillas', plantilla),
  editarPlantilla: (id, plantilla) => enviar('PUT', `/plantillas/${id}`, plantilla),
  borrarPlantilla: (id) => pedir(`/plantillas/${id}`, { method: 'DELETE' }),

  jornadas: (params = {}) => pedir(`/jornadas?${new URLSearchParams(params)}`),
  jornada: (id) => pedir(`/jornadas/${id}`),
  crearJornada: (jornada) => enviar('POST', '/jornadas', jornada),
  // Mide la ruta sin guardar nada: es lo que deja ver el ahorro antes de decidir.
  previsualizar: (datos) => enviar('POST', '/jornadas/previsualizar', datos),
  replanificar: (id, cambios) => enviar('PUT', `/jornadas/${id}/paradas`, cambios),
  // Agrega paradas a una ruta que ya va en camino. Con `aplicar: false` solo responde qué
  // haría —cuánto mide cada alternativa y cuál conviene— sin tocar nada.
  paradasExtra: (id, datos) => enviar('POST', `/jornadas/${id}/paradas-extra`, datos),
  despachar: (id) => enviar('POST', `/jornadas/${id}/despachar`),
  cerrar: (id) => enviar('POST', `/jornadas/${id}/cerrar`),
  cumplimiento: (id) => pedir(`/jornadas/${id}/cumplimiento`),
  trazo: (id) => pedir(`/jornadas/${id}/trazo`),
  // Lo que falta por recorrer desde donde esta el vehiculo ahora.
  avance: (id) => pedir(`/jornadas/${id}/avance`),
  // Quién está libre para un día y una hora, y el perfil de un conductor.
  disponibilidad: (params) => pedir(`/conductores/disponibilidad?${new URLSearchParams(params)}`),
  fichaConductor: (id, params = {}) =>
    pedir(`/conductores/${id}/ficha?${new URLSearchParams(params)}`),
  // Avisos de la campana y qué le llega a cada uno por correo.
  notificaciones: (params = {}) => pedir(`/notificaciones?${new URLSearchParams(params)}`),
  marcarLeidas: (ids) => enviar('POST', '/notificaciones/leidas', ids ? { ids } : {}),
  preferencias: () => pedir('/notificaciones/preferencias'),
  guardarPreferencia: (tipo, canal) =>
    enviar('PUT', '/notificaciones/preferencias', { tipo, canal }),
  marcarParada: (jornadaId, paradaId, evento) =>
    enviar('POST', `/jornadas/${jornadaId}/paradas/${paradaId}/evento`, evento),
};

export default rutasApi;
