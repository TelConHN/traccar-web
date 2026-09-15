// El punto que se está agregando, dibujado en el mapa mientras se completan sus datos.
//
// Es un marcador que se arrastra —con el mouse o con el dedo— y lleva alrededor el círculo del
// «Tamaño del lugar»: así se ve si la entrada del negocio queda adentro antes de guardarlo.
// Antes era un dibujo fijo debajo de un diálogo que tapaba el mapa, y si el toque caía en la casa
// de al lado la única salida era cancelar y empezar de nuevo.
import { useEffect, useId, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import turfCircle from '@turf/circle';
import { useTheme } from '@mui/material/styles';
import { map } from '../map/core/MapView';

const PuntoNuevoEnMapa = ({ latitud, longitud, radioMetros, onMover }) => {
  const id = useId();
  const theme = useTheme();
  const marcadorRef = useRef(null);
  // El último callback, para no rehacer el marcador (y cortar un arrastre) en cada render.
  const onMoverRef = useRef(onMover);
  useEffect(() => {
    onMoverRef.current = onMover;
  }, [onMover]);

  useEffect(() => {
    const marcador = new maplibregl.Marker({ draggable: true, color: theme.palette.error.main })
      .setLngLat([longitud, latitud])
      .addTo(map);
    marcador.on('dragend', () => {
      const { lat, lng } = marcador.getLngLat();
      onMoverRef.current(lat, lng);
    });
    marcadorRef.current = marcador;

    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-relleno`,
      source: id,
      type: 'fill',
      paint: { 'fill-color': theme.palette.error.main, 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: `${id}-borde`,
      source: id,
      type: 'line',
      paint: { 'line-color': theme.palette.error.main, 'line-width': 2, 'line-dasharray': [2, 2] },
    });

    return () => {
      marcador.remove();
      marcadorRef.current = null;
      if (map.getLayer(`${id}-borde`)) map.removeLayer(`${id}-borde`);
      if (map.getLayer(`${id}-relleno`)) map.removeLayer(`${id}-relleno`);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);

  useEffect(() => {
    marcadorRef.current?.setLngLat([longitud, latitud]);
    map
      .getSource(id)
      ?.setData(
        turfCircle([longitud, latitud], Number(radioMetros) || 50, { steps: 48, units: 'meters' }),
      );
  }, [latitud, longitud, radioMetros]);

  return null;
};

export default PuntoNuevoEnMapa;
