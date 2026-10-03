import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEffect, useMemo } from 'react';

import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { map } from '../core/MapView';
import { findFonts, geofenceToFeature, geometryToArea } from '../core/mapUtil';
import { errorsActions, geofencesActions } from '../../store';
import { useCatchCallback } from '../../reactHelper';
import drawTheme from './theme';
import { useTranslation } from '../../common/components/LocalizationProvider';
import fetchOrThrow from '../../common/util/fetchOrThrow';

MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';

// refresh: recarga el store (la pantalla de geocercas decide si son las propias o las de todos).
// visibleIds: si viene, solo se dibujan esas. onRemoveRequest: si viene, el bote de basura no
// borra directo sino que le pide confirmación a la pantalla. newQuery: se agrega al abrir el
// formulario de la geocerca recién dibujada (p. ej. ?cliente=ID desde la pestaña Usuarios).
const MapGeofenceEdit = ({
  selectedGeofenceId,
  refresh,
  visibleIds,
  onRemoveRequest,
  newQuery = '',
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const draw = useMemo(
    () =>
      new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          line_string: true,
          trash: true,
        },
        userProperties: true,
        styles: [
          ...drawTheme,
          {
            id: 'gl-draw-title',
            type: 'symbol',
            filter: ['all'],
            layout: {
              'text-field': '{user_name}',
              'text-font': findFonts(map),
              'text-size': 12,
            },
            paint: {
              'text-halo-color': 'white',
              'text-halo-width': 1,
            },
          },
        ],
      }),
    [],
  );

  const geofences = useSelector((state) => state.geofences.items);

  const defaultRefresh = useCatchCallback(async () => {
    const response = await fetchOrThrow('/api/geofences');
    dispatch(geofencesActions.refresh(await response.json()));
  }, [dispatch]);
  const refreshGeofences = refresh || defaultRefresh;

  useEffect(() => {
    refreshGeofences();

    map.addControl(draw, theme.direction === 'rtl' ? 'top-right' : 'top-left');
    return () => map.removeControl(draw);
  }, [refreshGeofences]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      const newItem = { name: t('sharedGeofence'), area: geometryToArea(feature.geometry) };
      draw.delete(feature.id);
      try {
        const response = await fetchOrThrow('/api/geofences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        });
        const item = await response.json();
        navigate(`/settings/geofence/${item.id}${newQuery}`);
      } catch (error) {
        dispatch(errorsActions.push(error.message));
      }
    };

    map.on('draw.create', listener);
    return () => map.off('draw.create', listener);
  }, [dispatch, navigate, newQuery]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      if (onRemoveRequest) {
        onRemoveRequest(feature.id);
        return;
      }
      try {
        await fetchOrThrow(`/api/geofences/${feature.id}`, { method: 'DELETE' });
        refreshGeofences();
      } catch (error) {
        dispatch(errorsActions.push(error.message));
      }
    };

    map.on('draw.delete', listener);
    return () => map.off('draw.delete', listener);
  }, [dispatch, refreshGeofences, onRemoveRequest]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      const item = Object.values(geofences).find((i) => i.id === feature.id);
      if (item) {
        const updatedItem = { ...item, area: geometryToArea(feature.geometry) };
        try {
          await fetchOrThrow(`/api/geofences/${feature.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedItem),
          });
          refreshGeofences();
        } catch (error) {
          dispatch(errorsActions.push(error.message));
        }
      }
    };

    map.on('draw.update', listener);
    return () => map.off('draw.update', listener);
  }, [dispatch, geofences, refreshGeofences]);

  useEffect(() => {
    draw.deleteAll();
    Object.values(geofences)
      .filter((geofence) => !visibleIds || visibleIds.has(geofence.id))
      .forEach((geofence) => {
        draw.add(geofenceToFeature(theme, geofence));
      });
  }, [geofences, visibleIds]);

  useEffect(() => {
    if (selectedGeofenceId) {
      const feature = draw.get(selectedGeofenceId);
      if (!feature) {
        return;
      }
      let { coordinates } = feature.geometry;
      if (Array.isArray(coordinates[0][0])) {
        [coordinates] = coordinates;
      }
      const bounds = coordinates.reduce(
        (bounds, coordinate) => bounds.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[1]),
      );
      const canvas = map.getCanvas();
      map.fitBounds(bounds, { padding: Math.min(canvas.width, canvas.height) * 0.1 });
    }
  }, [selectedGeofenceId]);

  return null;
};

export default MapGeofenceEdit;
