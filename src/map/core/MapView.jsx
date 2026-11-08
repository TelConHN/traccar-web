import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { googleProtocol } from 'maplibre-google-maps';
import { useRef, useLayoutEffect, useEffect, useState, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { SwitcherControl } from '../switcher/switcher';
import { useAttributePreference, usePreference } from '../../common/util/preferences';
import usePersistedState, { savePersistedState } from '../../common/util/usePersistedState';
import { mapImages } from './preloadImages';
import useMapStyles from './useMapStyles';
import { useEffectAsync } from '../../reactHelper';

const element = document.createElement('div');
element.style.width = '100%';
element.style.height = '100%';
element.style.boxSizing = 'initial';

maplibregl.addProtocol('google', googleProtocol);

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

// El selector de estilos del MapView montado, para recargar el estilo al recuperar el contexto.
let switcherMontado = null;

// Sin contexto, las capas propias (vehículos, geocercas…) se desmontan como al cambiar de estilo.
// Al recuperarlo, MapLibre restaura una copia del estilo de antes, con las capas que había en ese
// momento: se carga el estilo elegido desde cero para que no queden capas huérfanas (vehículos
// repetidos) y las capas se vuelven a dibujar. Si el mapa no está a la vista, lo hace el próximo
// MapView al montarse (su selector carga el estilo de nuevo).
map.on('webglcontextlost', () => updateReadyValue(false));
map.on('webglcontextrestored', () => switcherMontado?.reload());

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

  const [mapReady, setMapReady] = useState(false);

  const mapStyles = useMapStyles();
  const activeMapStyles = useAttributePreference(
    'activeMapStyles',
    'locationIqStreets,locationIqDark,openFreeMap',
  );
  const [defaultMapStyle] = usePersistedState(
    'selectedMapStyle',
    usePreference('map', 'locationIqStreets'),
  );
  const mapboxAccessToken = useAttributePreference('mapboxAccessToken');
  const maxZoom = useAttributePreference('web.maxZoom');

  const switcher = useMemo(
    () =>
      new SwitcherControl(
        () => updateReadyValue(false),
        (styleId) => savePersistedState('selectedMapStyle', styleId),
        () => {
          map.once('styledata', () => {
            const waiting = () => {
              if (!map.loaded()) {
                setTimeout(waiting, 33);
              } else {
                initMap();
                updateReadyValue(true);
              }
            };
            waiting();
          });
        },
      ),
    [],
  );

  useEffectAsync(async () => {
    if (theme.direction === 'rtl') {
      maplibregl.setRTLTextPlugin('/mapbox-gl-rtl-text.js');
    }
  }, [theme.direction]);

  useEffect(() => {
    const attribution = new maplibregl.AttributionControl({ compact: true });
    const navigation = new maplibregl.NavigationControl();
    map.addControl(attribution, theme.direction === 'rtl' ? 'bottom-left' : 'bottom-right');
    map.addControl(navigation, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    map.addControl(switcher, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    switcherMontado = switcher;
    return () => {
      if (switcherMontado === switcher) switcherMontado = null;
      map.removeControl(switcher);
      map.removeControl(navigation);
      map.removeControl(attribution);
    };
  }, [theme.direction, switcher]);

  useEffect(() => {
    if (maxZoom) {
      map.setMaxZoom(maxZoom);
    }
  }, [maxZoom]);

  useEffect(() => {
    maplibregl.accessToken = mapboxAccessToken;
  }, [mapboxAccessToken]);

  useEffect(() => {
    const filteredStyles = mapStyles.filter((s) => s.available && activeMapStyles.includes(s.id));
    const styles = filteredStyles.length ? filteredStyles : mapStyles.filter((s) => s.id === 'osm');
    switcher.updateStyles(styles, defaultMapStyle);
  }, [mapStyles, defaultMapStyle, activeMapStyles, switcher]);

  useEffect(() => {
    const listener = (ready) => setMapReady(ready);
    addReadyListener(listener);
    return () => {
      removeReadyListener(listener);
    };
  }, []);

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
      {mapReady && children}
    </div>
  );
};

export default MapView;
