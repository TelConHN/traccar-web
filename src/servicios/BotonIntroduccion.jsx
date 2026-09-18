// «Ver introducción» en el mapa principal: vuelve a abrir la explicación paso a paso.
//
// Es un control más del mapa, en la misma columna que el zoom, las capas, la búsqueda y la
// campana, con el mismo aspecto. Antes era un botón flotante con posición fija y tapaba la
// campana de eventos (en computadora y en el teléfono), porque esa columna crece según lo que
// tenga la cuenta. Como control, maplibre lo pone a continuación de los demás y nunca se enciman.
import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@mui/material';
import { map } from '../map/core/MapView';
import './botonIntroduccion.css';

class IntroduccionControl {
  constructor(alTocar) {
    this.alTocar = alTocar;
  }

  onAdd() {
    this.button = document.createElement('button');
    this.button.className = 'maplibregl-ctrl-icon maplibre-ctrl-introduccion';
    this.button.type = 'button';
    this.button.title = 'Ver introducción';
    this.button.setAttribute('aria-label', 'Ver introducción');
    this.button.onclick = () => this.alTocar.current?.();

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl-group maplibregl-ctrl';
    this.container.appendChild(this.button);
    return this.container;
  }

  onRemove() {
    this.container.parentNode?.removeChild(this.container);
  }
}

const BotonIntroduccion = ({ onAbrir }) => {
  const theme = useTheme();
  // El control vive fuera de React: se le pasa una referencia para que siempre llame a la
  // función actual sin tener que sacarlo y volverlo a poner.
  const alTocar = useRef(onAbrir);
  alTocar.current = onAbrir;
  const control = useMemo(() => new IntroduccionControl(alTocar), []);

  useEffect(() => {
    map.addControl(control, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    return () => map.removeControl(control);
  }, [control, theme.direction]);

  return null;
};

export default BotonIntroduccion;
