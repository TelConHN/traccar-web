import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { driverIdForms, normalizeDriverId } from '../components/DriverValue';

// Lo que lleva un vehículo: lo que leyeron sus lectores (atributo «products» de la última posición,
// lo arma el servidor) más lo asignado a mano (Dispositivo → Conexiones → Productos). Cada código
// leído se busca en el catálogo como se busca la tarjeta de un conductor: sin importar mayúsculas,
// ceros a la izquierda ni si se cargó en decimal o en hexadecimal.

export const buscarProducto = (items, codigo) => {
  if (items[codigo]) return items[codigo];
  const buscado = normalizeDriverId(codigo);
  const lista = Object.values(items);
  const exacto = lista.find((item) => normalizeDriverId(item.uniqueId) === buscado);
  if (exacto) return exacto;
  const formas = driverIdForms(codigo);
  return lista.find((item) => [...driverIdForms(item.uniqueId)].some((f) => formas.has(f)));
};

export const codigosLeidos = (position) =>
  String(position?.attributes?.products ?? '')
    .split(',')
    .filter(Boolean);

// Los asignados a mano se piden al servidor una vez por vehículo abierto (la tarjeta del mapa muestra
// uno a la vez). Lo leído llega solo con cada posición.
const useCarga = (deviceId) => {
  const position = useSelector((state) => state.session.positions[deviceId]);
  const catalogo = useSelector((state) => state.products.items);
  const [asignados, setAsignados] = useState([]);
  const [cargandoAsignados, setCargandoAsignados] = useState(true);

  useEffect(() => {
    if (!deviceId) return undefined;
    let vigente = true;
    const controller = new AbortController();
    setCargandoAsignados(true);
    fetch(`/api/products?deviceId=${deviceId}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((lista) => {
        if (vigente) {
          setAsignados(lista);
          setCargandoAsignados(false);
        }
      });
    return () => {
      vigente = false;
      controller.abort();
    };
  }, [deviceId]);

  const productos = useMemo(() => {
    const vistos = new Set();
    const resultado = [];
    codigosLeidos(position).forEach((codigo) => {
      const producto = buscarProducto(catalogo, codigo);
      const clave = producto ? `p${producto.id}` : `c${normalizeDriverId(codigo)}`;
      if (vistos.has(clave)) return;
      vistos.add(clave);
      resultado.push({
        clave,
        codigo,
        nombre: producto?.name ?? null,
        categoria: producto?.category ?? null,
        registrado: Boolean(producto),
        aMano: false,
      });
    });
    asignados.forEach((producto) => {
      const clave = `p${producto.id}`;
      if (vistos.has(clave)) return;
      vistos.add(clave);
      resultado.push({
        clave,
        codigo: producto.uniqueId,
        nombre: producto.name,
        categoria: producto.category ?? null,
        registrado: true,
        aMano: true,
      });
    });
    return resultado;
  }, [position, catalogo, asignados]);

  return { productos, cargando: cargandoAsignados };
};

export default useCarga;
