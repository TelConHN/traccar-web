import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { googleProtocol } from 'maplibre-google-maps';
import { Protocol } from 'pmtiles';
import { useRef, useLayoutEffect, useEffect, useState, useMemo, useReducer } from 'react';
import { useTheme } from '@mui/material';
import MapSwitcher from '../control/MapSwitcher';
import { useAttributePreference, usePreference } from '../../common/util/preferences';
import usePersistedState from '../../common/util/usePersistedState';
import { mapImages } from './preloadImages';
import useMapStyles from './useMapStyles';
import { useAsyncTask } from '../../reactHelper';

const element = document.createElement('div');
element.style.width = '100%';
element.style.height = '100%';
element.style.boxSizing = 'initial';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
maplibregl.addProtocol('google', googleProtocol);
maplibregl.addProtocol('pmtiles', new Protocol().tile);

export const map = new maplibregl.Map({
  container: element,
  attributionControl: false,
});

// Cuando el navegador le quita el contexto WebGL al mapa (teléfono con la app en segundo plano, poca
// memoria, la tarjeta gráfica que se reinicia), MapLibre deja `map.style` en null hasta recuperarlo.
// Mientras tanto, cualquier capa que se desmonte (salir del mapa a Ajustes, por ejemplo) llamaba
// map.getLayer y la aplicación entera se caía con «Cannot read properties of null (reading
// 'getLayer')». Sin estilo no hay capas que buscar ni quitar: estas consultas no hacen nada.
['getLayer', 'getSource', 'removeLayer', 'removeSource', 'hasImage'].forEach((metodo) => {
  const original = map[metodo].bind(map);
  map[metodo] = (...args) => (map.style ? original(...args) : undefined);
});

let ready = false;
const readyListeners = new Set();

const addReadyListener = (listener) => {
  readyListeners.add(listener);
  listener(ready);
};

const removeReadyListener = (listener) => {
  readyListeners.delete(listener);
};

const updateReadyValue = (value) => {
  ready = value;
  readyListeners.forEach((listener) => listener(value));
};

export const useMapReady = () => {
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const listener = (value) => setMapReady(value);
    addReadyListener(listener);
    return () => {
      removeReadyListener(listener);
    };
  }, []);

  return mapReady;
};

// Recarga del estilo del MapView montado, para usarla al recuperar el contexto WebGL.
let recargarEstiloMontado = null;

// Sin contexto, las capas propias (vehículos, geocercas…) se desmontan como al cambiar de estilo.
// Al recuperarlo, MapLibre restaura una copia del estilo de antes, con las capas que había en ese
// momento: se carga el estilo elegido desde cero para que no queden capas huérfanas (vehículos
// repetidos) y las capas se vuelven a dibujar. Si el mapa no está a la vista, lo hace el próximo
// MapView al montarse (aplica el estilo al montarse).
map.on('webglcontextlost', () => updateReadyValue(false));
map.on('webglcontextrestored', () => recargarEstiloMontado?.());
const initMap = async () => {
  if (ready) return;
  if (!map.hasImage('background')) {
    Object.entries(mapImages).forEach(([key, value]) => {
      map.addImage(key, value, {
        pixelRatio: window.devicePixelRatio,
      });
    });
  }
};

const MapView = ({ children }) => {
  const theme = useTheme();

  const containerRef = useRef(null);

  const mapReady = useMapReady();

  const mapStyles = useMapStyles();
  const activeMapStyles = useAttributePreference(
    'activeMapStyles',
    'openFreeMap,locationIqStreets,locationIqDark',
  );
  const [selectedStyleId, setSelectedStyleId] = usePersistedState(
    'selectedMapStyle',
    usePreference('map', 'openFreeMap'),
  );
  const maxZoom = useAttributePreference('web.maxZoom');
  const [recargaEstilo, recargarEstilo] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    recargarEstiloMontado = recargarEstilo;
    return () => {
      if (recargarEstiloMontado === recargarEstilo) recargarEstiloMontado = null;
    };
  }, []);

  const styles = useMemo(() => {
    const filtered = mapStyles.filter((s) => s.available && activeMapStyles.includes(s.id));
    return filtered.length ? filtered : mapStyles.filter((s) => s.id === 'osm');
  }, [mapStyles, activeMapStyles]);

  useAsyncTask(async () => {
    if (theme.direction === 'rtl') {
      maplibregl.setRTLTextPlugin(new URL('mapbox-gl-rtl-text.js', document.baseURI).href);
    }
  }, [theme.direction]);

  useEffect(() => {
    const attribution = new maplibregl.AttributionControl({ compact: true });
    const navigation = new maplibregl.NavigationControl();
    map.addControl(attribution, theme.direction === 'rtl' ? 'bottom-left' : 'bottom-right');
    map.addControl(navigation, theme.direction === 'rtl' ? 'top-left' : 'top-right');

    return () => {
      map.removeControl(navigation);
      map.removeControl(attribution);
    };
  }, [theme.direction]);

  useEffect(() => {
    if (maxZoom) {
      map.setMaxZoom(maxZoom);
    }
  }, [maxZoom]);

  useEffect(() => {
    const style = styles.find((s) => s.id === selectedStyleId);
    if (!style) {
      setSelectedStyleId(styles[0].id);
      return;
    }
    updateReadyValue(false);
    map.coordinateSystem = style.coordinateSystem;
    map.setStyle(style.style, { diff: false });
    map.setTransformRequest(style.transformRequest);
    let timeoutId;
    const waiting = () => {
      if (!map.loaded()) {
        timeoutId = setTimeout(waiting, 33);
      } else {
        initMap();
        updateReadyValue(true);
      }
    };
    map.once('styledata', waiting);
    return () => clearTimeout(timeoutId);
    // recargaEstilo: vuelve a aplicar el mismo estilo al recuperar el contexto WebGL.
  }, [styles, selectedStyleId, setSelectedStyleId, recargaEstilo]);

  useLayoutEffect(() => {
    const currentEl = containerRef.current;
    currentEl.appendChild(element);
    map.resize();
    return () => {
      currentEl.removeChild(element);
    };
  }, [containerRef]);

  return (
    <div style={{ width: '100%', height: '100%' }} ref={containerRef}>
      <MapSwitcher styles={styles} selectedId={selectedStyleId} onSelect={setSelectedStyleId} />
      {mapReady && children}
    </div>
  );
};

export default MapView;
