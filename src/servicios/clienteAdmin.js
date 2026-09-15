// Sobre qué cliente está trabajando un administrador de TelConHN en Rutas y Transporte.
//
// Un administrador ve en Traccar los vehículos de todos los clientes. Para armar algo a nombre de
// uno —una ruta, un punto, un conductor, la configuración de Transporte— elige el cliente arriba de
// la pantalla, y cada petición al servicio lleva la cabecera X-Rutas-Cliente. El servidor la
// valida y SOLO la acepta de un administrador: a cualquier otra sesión se la ignora, así que quedar
// guardada en un navegador que después usa un cliente no le da acceso a nada.
//
// Se guarda en el navegador (no en la dirección) porque tiene que sobrevivir al pasar de Rutas a
// Transporte y entre secciones, y es la misma elección para los dos módulos.
import { useEffect, useState } from 'react';

const CLAVE = 'telconhn.clienteAdmin';
const EVENTO = 'telconhn:cliente-admin';

export const leerClienteAdmin = () => {
  try {
    const valor = JSON.parse(window.localStorage.getItem(CLAVE));
    return valor && Number.isInteger(valor.id) ? valor : null;
  } catch {
    return null;
  }
};

/// `null` = todos los clientes.
export const guardarClienteAdmin = (cliente) => {
  try {
    if (cliente) {
      window.localStorage.setItem(
        CLAVE,
        JSON.stringify({ id: cliente.id, nombre: cliente.nombre }),
      );
    } else {
      window.localStorage.removeItem(CLAVE);
    }
  } catch {
    /* sin almacenamiento del navegador la elección dura lo que la pestaña */
  }
  window.dispatchEvent(new Event(EVENTO));
};

export const cabeceraClienteAdmin = () => {
  const cliente = leerClienteAdmin();
  return cliente ? { 'X-Rutas-Cliente': String(cliente.id) } : {};
};

/// El cliente elegido, y se actualiza cuando se elige otro (también desde otra pestaña).
export const useClienteAdmin = () => {
  const [cliente, setCliente] = useState(leerClienteAdmin);
  useEffect(() => {
    const refrescar = () => setCliente(leerClienteAdmin());
    window.addEventListener(EVENTO, refrescar);
    window.addEventListener('storage', refrescar);
    return () => {
      window.removeEventListener(EVENTO, refrescar);
      window.removeEventListener('storage', refrescar);
    };
  }, []);
  return cliente;
};

/// Los clientes con ese servicio en al menos un vehículo. Solo responde a un administrador.
export const clientesParaAdmin = async (servicio) => {
  const respuesta = await fetch(`/api/rutas/admin/clientes?servicio=${servicio}`);
  if (!respuesta.ok) throw new Error('No se pudo cargar la lista de clientes.');
  return respuesta.json();
};
