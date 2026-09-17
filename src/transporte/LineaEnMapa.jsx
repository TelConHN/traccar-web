// Una línea de Transporte dibujada en el mapa: el trazo, opcionalmente el trazo crudo del GPS
// (punteado) y las paradas con su radio.
//
// Se dibuja directo con maplibre —como PuntoNuevoEnMapa en Rutas— y no con MapRouteCoordinates
// porque acá hacen falta dos trazos de colores distintos a la vez (el ajustado y el crudo) y
// círculos de radio por parada, que ese componente no dibuja. Todo lo que se agrega se quita al
// desmontar: un mapa con capas huérfanas es el error más común de estas pantallas.
import { useEffect, useId } from 'react';
import turfCircle from '@turf/circle';
import { useTheme } from '@mui/material/styles';
import { map } from '../map/core/MapView';

// `[[lat, lon]]` → GeoJSON LineString ([lon, lat]).
const lineaGeoJson = (coordenadas) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: (coordenadas ?? []).map(([lat, lon]) => [lon, lat]),
  },
});

const LineaEnMapa = ({ coordenadas, crudo, paradas, color, resaltada }) => {
  const id = useId();
  const theme = useTheme();
  const colorLinea = color ?? theme.palette.primary.main;

  useEffect(() => {
    const vacio = { type: 'FeatureCollection', features: [] };
    map.addSource(`${id}-crudo`, { type: 'geojson', data: lineaGeoJson([]) });
    map.addLayer({
      id: `${id}-crudo`,
      source: `${id}-crudo`,
      type: 'line',
      paint: {
        'line-color': theme.palette.text.secondary,
        'line-width': 2,
        'line-dasharray': [1, 2],
      },
    });
    map.addSource(`${id}-linea`, { type: 'geojson', data: lineaGeoJson([]) });
    map.addLayer({
      id: `${id}-linea`,
      source: `${id}-linea`,
      type: 'line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': colorLinea,
        'line-width': resaltada ? 5 : 3,
        'line-opacity': resaltada ? 1 : 0.6,
      },
    });
    map.addSource(`${id}-radios`, { type: 'geojson', data: vacio });
    map.addLayer({
      id: `${id}-radios`,
      source: `${id}-radios`,
      type: 'fill',
      paint: { 'fill-color': colorLinea, 'fill-opacity': 0.12 },
    });
    map.addSource(`${id}-paradas`, { type: 'geojson', data: vacio });
    map.addLayer({
      id: `${id}-paradas`,
      source: `${id}-paradas`,
      type: 'circle',
      paint: {
        'circle-radius': 7,
        // Con `color` por parada (el resultado en un viaje) manda ese; si no, la terminal en
        // rojo y el resto del color de la línea.
        'circle-color': [
          'coalesce',
          ['get', 'color'],
          ['case', ['get', 'terminal'], theme.palette.error.main, colorLinea],
        ],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: `${id}-numeros`,
      source: `${id}-paradas`,
      type: 'symbol',
      layout: {
        'text-field': ['get', 'orden'],
        'text-size': 11,
        'text-offset': [0, -1.4],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': theme.palette.text.primary,
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      },
    });

    return () => {
      for (const capa of ['numeros', 'paradas', 'radios', 'linea', 'crudo']) {
        if (map.getLayer(`${id}-${capa}`)) map.removeLayer(`${id}-${capa}`);
      }
      for (const fuente of ['paradas', 'radios', 'linea', 'crudo']) {
        if (map.getSource(`${id}-${fuente}`)) map.removeSource(`${id}-${fuente}`);
      }
    };
    // Las capas se crean una vez; los datos se actualizan abajo.
  }, []);

  useEffect(() => {
    map.getSource(`${id}-linea`)?.setData(lineaGeoJson(coordenadas));
  }, [coordenadas]);

  useEffect(() => {
    map.getSource(`${id}-crudo`)?.setData(lineaGeoJson(crudo));
  }, [crudo]);

  useEffect(() => {
    if (map.getLayer(`${id}-linea`)) {
      map.setPaintProperty(`${id}-linea`, 'line-width', resaltada ? 5 : 3);
      map.setPaintProperty(`${id}-linea`, 'line-opacity', resaltada ? 1 : 0.6);
    }
  }, [resaltada]);

  useEffect(() => {
    const lista = paradas ?? [];
    map.getSource(`${id}-paradas`)?.setData({
      type: 'FeatureCollection',
      features: lista.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(p.longitud), Number(p.latitud)] },
        properties: {
          orden: String(p.orden ?? i + 1),
          terminal: Boolean(p.terminal),
          color: p.color ?? null,
        },
      })),
    });
    map.getSource(`${id}-radios`)?.setData({
      type: 'FeatureCollection',
      features: lista.map((p) =>
        turfCircle([Number(p.longitud), Number(p.latitud)], Number(p.radioMetros) || 50, {
          steps: 32,
          units: 'meters',
        }),
      ),
    });
  }, [paradas]);

  return null;
};

export default LineaEnMapa;
