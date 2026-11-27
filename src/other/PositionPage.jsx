import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  Typography,
  Container,
  Paper,
  AppBar,
  Toolbar,
  IconButton,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tabs,
  Tab,
  Alert,
  Box,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsyncTask } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import PositionValue from '../common/components/PositionValue';
import AttributeName from '../common/components/AttributeName';
import usePositionAttributes from '../common/attributes/usePositionAttributes';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatTime } from '../common/util/formatter';
import MapView from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import MapPositionMarkers from '../map/MapPositionMarkers';
import MapGeofence from '../map/MapGeofence';
import MapScale from '../map/MapScale';
import StatusCard from '../common/components/StatusCard';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    zIndex: 1,
  },
  title: {
    minWidth: 0,
  },
  mapContainer: {
    flexGrow: 1,
    position: 'relative',
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    overflow: 'auto',
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  breakAll: {
    wordBreak: 'break-word',
  },
}));

// La última vista que eligió la persona (mapa o datos) se recuerda en este navegador.
const VIEW_KEY = 'positionPageView';
const readView = () => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'data' ? 'data' : 'map';
  } catch {
    return 'map';
  }
};
const saveView = (view) => {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Sin almacenamiento (ventana privada): solo no se recuerda.
  }
};

// "Ver ubicación" (Auditoría): la posición en el mapa o todos sus datos, a elección.
const PositionPage = () => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const t = useTranslation();

  const positionAttributes = usePositionAttributes(t);

  const { id } = useParams();

  const [item, setItem] = useState();
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState(readView);
  const [showCard, setShowCard] = useState(false);
  const [extraDevice, setExtraDevice] = useState();

  useAsyncTask(
    async ({ signal }) => {
      if (id) {
        const response = await fetchOrThrow(`api/positions?id=${id}`, { signal });
        const positions = await response.json();
        if (positions.length > 0) {
          setItem(positions[0]);
        } else {
          setNotFound(true);
        }
      }
    },
    [id],
  );

  const storeDevice = useSelector((state) =>
    item ? state.devices.items[item.deviceId] : undefined,
  );

  // Un vehículo que no está en la lista de esta cuenta (el de un cliente, visto por administración)
  // se pide aparte para tener su nombre e ícono.
  const deviceId = item?.deviceId;
  const inStore = !!storeDevice;
  useAsyncTask(
    async ({ signal }) => {
      if (deviceId && !inStore) {
        // Por id directo: `api/devices?id=` solo devuelve los vinculados a la cuenta, aunque sea admin.
        const response = await fetch(`api/devices/${deviceId}`, { signal });
        if (response.ok) {
          setExtraDevice(await response.json());
        } else {
          // Vehículo borrado (sus posiciones quedan): igual se marca dónde estuvo, con ícono genérico.
          setExtraDevice({
            id: deviceId,
            name: 'Vehículo eliminado',
            category: 'default',
            status: 'unknown',
            attributes: {},
          });
        }
      }
    },
    [deviceId, inStore],
  );

  const device = storeDevice || extraDevice;
  const extraDevices = useMemo(
    () => (extraDevice && !storeDevice ? { [extraDevice.id]: extraDevice } : null),
    [extraDevice, storeDevice],
  );

  const hasCoordinates = item && !(item.latitude === 0 && item.longitude === 0);
  const currentView = item && !hasCoordinates ? 'data' : view;

  const changeView = (_, value) => {
    setView(value);
    saveView(value);
  };

  const onMarkerClick = useCallback(
    (positionId) => {
      if (storeDevice) {
        setShowCard(Boolean(positionId));
      } else if (positionId) {
        setView('data');
      }
    },
    [storeDevice],
  );

  return (
    <div className={classes.root}>
      <AppBar position="static" color="inherit" className={classes.toolbar}>
        <Toolbar>
          <IconButton color="inherit" edge="start" sx={{ mr: 2 }} onClick={() => navigate(-1)}>
            <BackIcon />
          </IconButton>
          <Box className={classes.title}>
            <Typography variant="h6" noWrap>
              {device?.name}
            </Typography>
            {item && (
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                {formatTime(item.fixTime, 'seconds')}
              </Typography>
            )}
          </Box>
        </Toolbar>
        <Tabs value={currentView} onChange={changeView} variant="fullWidth">
          <Tab value="map" label="Mapa" disabled={!!item && !hasCoordinates} />
          <Tab value="data" label="Datos" />
        </Tabs>
      </AppBar>
      {notFound && (
        <Container maxWidth="sm" sx={{ mt: 2 }}>
          <Alert severity="warning">Esta posición ya no existe o no tienes acceso a ella.</Alert>
        </Container>
      )}
      {currentView === 'map' && !notFound && (
        <div className={classes.mapContainer}>
          <MapView>
            <MapGeofence />
            {item && (
              <MapPositionMarkers
                positions={[item]}
                onMarkerClick={onMarkerClick}
                titleField="fixTime"
                extraDevices={extraDevices}
              />
            )}
          </MapView>
          <MapScale />
          {item && <MapCamera latitude={item.latitude} longitude={item.longitude} />}
          {item && !item.valid && (
            <Alert
              severity="info"
              sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2 }}
            >
              El GPS marcó esta posición como no confirmada: puede ser la última ubicación conocida.
            </Alert>
          )}
          {item && showCard && storeDevice && (
            <StatusCard
              deviceId={item.deviceId}
              position={item}
              onClose={() => setShowCard(false)}
              disableActions
            />
          )}
        </div>
      )}
      {currentView === 'data' && !notFound && (
        <div className={classes.content}>
          <Container maxWidth="sm">
            {item && !hasCoordinates && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Esta posición no trae coordenadas (por ejemplo, una alarma enviada sin señal de
                GPS): no se puede mostrar en el mapa.
              </Alert>
            )}
            <Paper className={classes.tableWrapper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('stateName')}</TableCell>
                    <TableCell>{t('sharedName')}</TableCell>
                    <TableCell>{t('stateValue')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {item &&
                    Object.getOwnPropertyNames(item)
                      .filter((it) => it !== 'attributes')
                      .map((property) => (
                        <TableRow key={property}>
                          <TableCell>{property}</TableCell>
                          <TableCell>
                            <strong>{positionAttributes[property]?.name}</strong>
                          </TableCell>
                          <TableCell className={classes.breakAll}>
                            <PositionValue position={item} property={property} />
                          </TableCell>
                        </TableRow>
                      ))}
                  {item &&
                    Object.getOwnPropertyNames(item.attributes).map((attribute) => (
                      <TableRow key={attribute}>
                        <TableCell>{attribute}</TableCell>
                        <TableCell>
                          <strong>
                            <AttributeName attribute={positionAttributes[attribute]} />
                          </strong>
                        </TableCell>
                        <TableCell className={classes.breakAll}>
                          <PositionValue position={item} attribute={attribute} />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Paper>
          </Container>
        </div>
      )}
    </div>
  );
};

export default PositionPage;
