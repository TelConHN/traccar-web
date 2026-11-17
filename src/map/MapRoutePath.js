import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import useMapLayer from './core/useMapLayer';
import getSpeedColor from '../common/util/colors';
import { useAttributePreference } from '../common/util/preferences';
import { toMapCoordinates } from './core/mapUtil';

// Niveles de color con que se pinta la ruta. La velocidad se cuantiza a estos
// niveles y TODOS los segmentos de un mismo nivel viajan juntos en un solo
// Feature (`MultiLineString`), en vez de un Feature por segmento: con 20.000
// posiciones eso baja de ~20.000 objetos GeoJSON a 120 como mucho, que es el
// grueso del trabajo que el navegador hacía al abrir el recorrido.
//
// La geometría es exactamente la misma (todos los puntos, todos los segmentos)
// y cada segmento conserva su propio color — sólo se redondea a 1/120 de la
// escala, indistinguible a ojo en el colormap Turbo. A diferencia de un
// `line-gradient`, el color NO se promedia a lo largo de la ruta, así que al
// hacer zoom se sigue viendo la variación real de velocidad punto a punto.
const SPEED_BANDS = 120;

const MapRoutePath = ({ positions }) => {
  const reportColor = useSelector((state) => {
    const position = positions?.find(() => true);
    if (position) {
      const attributes = state.devices.items[position.deviceId]?.attributes;
      if (attributes) {
        const color = attributes['web.reportColor'];
        if (color) {
          return color;
        }
      }
    }
    return null;
  });

  const mapLineWidth = useAttributePreference('mapLineWidth', 2);
  const mapLineOpacity = useAttributePreference('mapLineOpacity', 1);

  // Solo se recalcula cuando cambian las posiciones o el estilo, no en cada render.
  const features = useMemo(() => {
    const minSpeed = positions.map((p) => p.speed).reduce((a, b) => Math.min(a, b), Infinity);
    const maxSpeed = positions.map((p) => p.speed).reduce((a, b) => Math.max(a, b), -Infinity);
    // Agrupa los segmentos por nivel de color (ver SPEED_BANDS arriba).
    const segmentsByBand = new Map();
    for (let i = 0; i < positions.length - 1; i += 1) {
      // Sin variación de velocidad la normalización dividiría entre cero y el
      // color saldría NaN (color CSS inválido), así que cae al extremo frío.
      const normalized =
        maxSpeed > minSpeed ? (positions[i + 1].speed - minSpeed) / (maxSpeed - minSpeed) : 0;
      const band = Math.round(normalized * (SPEED_BANDS - 1));
      let segments = segmentsByBand.get(band);
      if (!segments) {
        segments = [];
        segmentsByBand.set(band, segments);
      }
      segments.push([
        toMapCoordinates(positions[i].longitude, positions[i].latitude),
        toMapCoordinates(positions[i + 1].longitude, positions[i + 1].latitude),
      ]);
    }

    const result = [];
    segmentsByBand.forEach((segments, band) => {
      result.push({
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates: segments,
        },
        properties: {
          // getSpeedColor normaliza (valor - min) / (max - min): pasarle el
          // nivel sobre SPEED_BANDS - 1 da exactamente el color de ese nivel.
          color: reportColor || getSpeedColor(band, 0, SPEED_BANDS - 1),
          width: mapLineWidth,
          opacity: mapLineOpacity,
        },
      });
    });
    return result;
  }, [positions, reportColor, mapLineWidth, mapLineOpacity]);

  useMapLayer({
    layers: [
      {
        type: 'line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      },
    ],
    layersDeps: [],
    data: {
      type: 'FeatureCollection',
      features,
    },
    dataDeps: [features],
  });

  return null;
};

export default MapRoutePath;
