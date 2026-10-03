import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Autocomplete,
  Divider,
  Typography,
  IconButton,
  Toolbar,
  Paper,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import Tooltip from '@mui/material/Tooltip';
import { makeStyles } from 'tss-react/mui';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useNavigate } from 'react-router-dom';
import MapView from '../map/core/MapView';
import MapCurrentLocation from '../map/MapCurrentLocation';
import MapGeofenceEdit from '../map/draw/MapGeofenceEdit';
import GeofencesList from './GeofencesList';
import { useTranslation } from '../common/components/LocalizationProvider';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import { errorsActions, geofencesActions } from '../store';
import MapScale from '../map/MapScale';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useAdministrator } from '../common/util/permissions';
import { useCatchCallback } from '../reactHelper';
import GeofenceRemoveDialog from './GeofenceRemoveDialog';
import {
  createdByLabel,
  fetchAssignments,
  filterUsers,
  geofenceClients,
  geofenceDeviceIds,
  renderUserOption,
} from './geofenceAssignments';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  content: {
    flexGrow: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column-reverse',
    },
  },
  drawer: {
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('sm')]: {
      width: theme.dimensions.drawerWidthDesktop,
    },
    [theme.breakpoints.down('sm')]: {
      height: theme.dimensions.drawerHeightPhone,
    },
  },
  // Administrador en el teléfono: pestañas + cliente + buscador no dejan lugar a la lista en 250px.
  drawerAdmin: {
    [theme.breakpoints.down('sm')]: {
      height: '55vh',
    },
  },
  mapContainer: {
    flexGrow: 1,
  },
  title: {
    flexGrow: 1,
  },
  fileInput: {
    display: 'none',
  },
  hint: {
    padding: theme.spacing(2),
  },
}));

const GeofencesPage = () => {
  const { classes, cx } = useStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const [selectedGeofenceId, setSelectedGeofenceId] = useState();

  // Administrador: dos pestañas para no ver todo de golpe. "Administración" = geocercas de
  // Telcon (o sin dueño); "Usuarios" = las de UN cliente elegido. Las de los clientes solo se
  // cargan aquí, el mapa principal sigue mostrando solo las propias.
  const admin = useAdministrator();
  const items = useSelector((state) => state.geofences.items);
  const [tab, setTab] = useState('admin');
  const [clientId, setClientId] = useState(null);
  const [data, setData] = useState();
  const [removingId, setRemovingId] = useState(null);
  const [search, setSearch] = useState('');
  // Lo que se dibuje con un cliente elegido nace como de ese cliente (se confirma al guardar).
  const newQuery = admin && tab === 'usuarios' && clientId ? `?cliente=${clientId}` : '';

  const refreshGeofences = useCatchCallback(async () => {
    const [response, assignments] = await Promise.all([
      fetchOrThrow('/api/geofences?all=true'),
      fetchAssignments(),
    ]);
    dispatch(geofencesActions.refresh(await response.json()));
    setData(assignments);
  }, [dispatch]);

  useEffect(() => {
    if (!admin) return undefined;
    return () => {
      // Al salir, el store vuelve a tener solo las geocercas propias.
      fetchOrThrow('/api/geofences')
        .then((response) => response.json())
        .then((own) => dispatch(geofencesActions.refresh(own)))
        .catch(() => {});
    };
  }, [admin, dispatch]);

  const ownerKind = useCallback(
    (geofenceId) => {
      const users = (data?.geofenceUsers[geofenceId] || [])
        .map((id) => data.users[id])
        .filter(Boolean);
      return {
        telcon: users.length === 0 || users.some((user) => user.administrator),
        clientIds: users.filter((user) => !user.administrator).map((user) => user.id),
      };
    },
    [data],
  );

  const clientOptions = useMemo(() => {
    if (!data) return [];
    const counts = {};
    Object.values(items).forEach((geofence) => {
      ownerKind(geofence.id).clientIds.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map((id) => ({ ...data.users[id], count: counts[id] }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [data, items, ownerKind]);

  // En Usuarios sin cliente elegido, el buscador encuentra la geocerca entre todos los clientes.
  const keyword = search.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!admin) return undefined;
    if (!data) return new Set();
    return new Set(
      Object.values(items)
        .filter((geofence) => {
          const kind = ownerKind(geofence.id);
          if (tab === 'admin') return kind.telcon;
          if (clientId) return kind.clientIds.includes(clientId);
          return keyword && kind.clientIds.length > 0;
        })
        .filter((geofence) => !keyword || (geofence.name || '').toLowerCase().includes(keyword))
        .map((geofence) => geofence.id),
    );
  }, [admin, data, items, tab, clientId, keyword, ownerKind]);

  const secondary = (geofence) => {
    if (!data) return null;
    const deviceIds = geofenceDeviceIds(data, geofence.id);
    const count = deviceIds.length;
    let parts = [`${count} ${count === 1 ? 'carro' : 'carros'}`];
    if (tab === 'usuarios' && clientId) {
      // Con un cliente elegido: en cuáles de SUS carros está.
      const own = (data.userDevices[clientId] || []).filter((id) => data.devices[id]);
      const names = own.filter((id) => deviceIds.includes(id)).map((id) => data.devices[id].name);
      parts = [
        names.length ? `En ${names.join(', ')}` : 'En ninguno de sus carros',
        `${names.length} de ${own.length} ${own.length === 1 ? 'carro' : 'carros'}`,
      ];
    }
    if (tab === 'admin') {
      const clients = geofenceClients(data, geofence.id);
      if (clients.length)
        parts.push(`también la ve ${clients.map((user) => user.name).join(', ')}`);
      if (!(data.geofenceUsers[geofence.id] || []).length) parts.push('sin dueño');
    } else {
      if (!clientId) {
        const owners = geofenceClients(data, geofence.id).map((user) => user.name);
        parts.push(`de ${owners.join(', ')}`);
      }
      const createdBy = createdByLabel(data, geofence);
      if (createdBy) parts.push(`creada por ${createdBy}`);
    }
    return parts.join(' · ');
  };

  const handleRemoveClosed = () => {
    setRemovingId(null);
    // También al cancelar: el bote del mapa ya la quitó del dibujo y hay que volver a pintarla.
    refreshGeofences();
  };

  const handleFile = (event) => {
    const files = Array.from(event.target.files);
    const [file] = files;
    const reader = new FileReader();
    reader.onload = async () => {
      const xml = new DOMParser().parseFromString(reader.result, 'text/xml');
      const segment = xml.getElementsByTagName('trkseg')[0];
      const coordinates = Array.from(segment.getElementsByTagName('trkpt'))
        .map((point) => `${point.getAttribute('lat')} ${point.getAttribute('lon')}`)
        .join(', ');
      const area = `LINESTRING (${coordinates})`;
      const newItem = { name: t('sharedGeofence'), area };
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
    reader.onerror = (event) => {
      dispatch(errorsActions.push(event.target.error));
    };
    reader.readAsText(file);
  };

  return (
    <div className={classes.root}>
      <div className={classes.content}>
        <Paper square className={cx(classes.drawer, admin && classes.drawerAdmin)}>
          <Toolbar>
            <IconButton edge="start" sx={{ mr: 2 }} onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Typography variant="h6" className={classes.title}>
              {t('sharedGeofences')}
            </Typography>
            <label htmlFor="upload-gpx">
              <input
                accept=".gpx"
                id="upload-gpx"
                type="file"
                className={classes.fileInput}
                onChange={handleFile}
              />
              <IconButton edge="end" component="span" onClick={() => {}}>
                <Tooltip title={t('sharedUpload')}>
                  <UploadFileIcon />
                </Tooltip>
              </IconButton>
            </label>
          </Toolbar>
          {admin && (
            <Tabs value={tab} onChange={(event, value) => setTab(value)} variant="fullWidth">
              <Tab value="admin" label="Administración" />
              <Tab value="usuarios" label="Usuarios" />
            </Tabs>
          )}
          {admin && tab === 'usuarios' && (
            <Autocomplete
              sx={{ px: 2, py: 1 }}
              options={clientOptions}
              value={clientOptions.find((user) => user.id === clientId) || null}
              onChange={(event, user) => {
                setClientId(user?.id || null);
                // Llevar el mapa a la primera geocerca del cliente (si no, queda en el mundo).
                const first =
                  user &&
                  Object.values(items).find((geofence) =>
                    ownerKind(geofence.id).clientIds.includes(user.id),
                  );
                if (first) setSelectedGeofenceId(first.id);
              }}
              getOptionLabel={(user) => user.name || ''}
              filterOptions={filterUsers}
              renderOption={(props, user) =>
                renderUserOption(
                  props,
                  user,
                  `${user.count} ${user.count === 1 ? 'geocerca' : 'geocercas'}`,
                )
              }
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Ningún cliente tiene geocercas"
              renderInput={(params) => (
                <TextField {...params} size="small" label="Cliente" placeholder="Nombre o correo" />
              )}
            />
          )}
          {admin && (
            <TextField
              sx={{ px: 2, pb: 1, pt: tab === 'usuarios' ? 0 : 1 }}
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                tab === 'usuarios' && !clientId
                  ? 'Buscar geocerca en todos los clientes'
                  : 'Buscar geocerca por nombre'
              }
            />
          )}
          <Divider />
          {admin && tab === 'usuarios' && !clientId && !keyword ? (
            <Typography variant="body2" color="textSecondary" className={classes.hint}>
              Elige un cliente para ver y administrar sus geocercas (el número al lado de cada
              cliente es cuántas tiene), o escribe arriba el nombre de una geocerca para buscarla
              entre todos.
            </Typography>
          ) : (
            <GeofencesList
              onGeofenceSelected={setSelectedGeofenceId}
              {...(admin && {
                refresh: refreshGeofences,
                visibleIds,
                onRemove: setRemovingId,
                secondary,
              })}
            />
          )}
        </Paper>
        <div className={classes.mapContainer}>
          <MapView>
            <MapGeofenceEdit
              selectedGeofenceId={selectedGeofenceId}
              {...(admin && {
                refresh: refreshGeofences,
                visibleIds,
                onRemoveRequest: setRemovingId,
                newQuery,
              })}
            />
          </MapView>
          <MapScale />
          <MapCurrentLocation />
          <MapGeocoder />
        </div>
      </div>
      {admin && (
        <GeofenceRemoveDialog
          geofence={removingId ? items[removingId] : null}
          data={data}
          onClose={handleRemoveClosed}
        />
      )}
    </div>
  );
};

export default GeofencesPage;
