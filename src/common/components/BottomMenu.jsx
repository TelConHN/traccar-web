import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Paper,
  BottomNavigation,
  BottomNavigationAction,
  Menu,
  MenuItem,
  Typography,
  Badge,
} from '@mui/material';

import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import RouteIcon from '@mui/icons-material/Route';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';

import { sessionActions } from '../../store';
import { useTranslation } from './LocalizationProvider';
import { useAdministrator, useRestriction } from '../util/permissions';
import { nativePostMessage } from './NativeInterface';

const BottomMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const t = useTranslation();

  const readonly = useRestriction('readonly');
  const admin = useAdministrator();
  const deviceReadonly = useRestriction('deviceReadonly');
  const devices = useSelector((state) => state.devices.items);
  const user = useSelector((state) => state.session.user);
  const socket = useSelector((state) => state.session.socket);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const allowedReports = useSelector((state) => {
    const raw = state.session.user.attributes?.allowedReports || '';
    return raw.split(',').filter(Boolean);
  });

  const reportRouteMap = {
    combined: '/reports/combined',
    events: '/reports/events',
    geofences: '/reports/geofences',
    trips: '/reports/trips',
    stops: '/reports/stops',
    summary: '/reports/summary',
    chart: '/reports/chart',
    replay: '/replay',
    route: '/reports/route',
    logs: '/reports/logs',
    scheduled: '/reports/scheduled',
  };

  const firstAllowedReportPath = () => {
    for (const key of allowedReports) {
      if (reportRouteMap[key]) return reportRouteMap[key];
    }
    return '/replay';
  };

  const [anchorEl, setAnchorEl] = useState(null);

  // Módulo de Rutas: se decide con los dispositivos que la aplicación YA tiene cargados.
  //
  // Antes esto era una consulta HTTP al montar el menú, y se notaba: los demás botones se
  // dibujaban de una y el de Rutas aparecía un instante después, empujando a los otros. El
  // atributo `rutas` lo escribe el panel admin sobre el vehículo a partir del contrato, y el
  // vehículo ya está en el estado de la aplicación — así que la respuesta existe desde el
  // primer render, sin pedir nada y sin que el menú se mueva.
  // Un conductor siempre ve la entrada, tenga o no ruta asignada hoy: si no la tiene, la
  // pantalla se lo dice. Antes dependía de que hubiera un vehículo con el servicio, y un
  // conductor sin jornada activa no tiene ninguno — así que el módulo le desaparecía.
  //
  // Un administrador —solo el personal de TelConHN: el panel admin da `administrator` únicamente
  // a sus roles superadmin y administrador, nunca a un cliente— ve siempre las dos entradas. Es
  // quien configura y da soporte, y tiene que poder abrir el módulo antes de que exista el primer
  // contrato con el servicio; la pantalla le explica cómo activarlo.
  const esConductor = user?.attributes?.['rutas.rol'] === 'conductor';
  const tieneRutas =
    esConductor || admin || Object.values(devices).some((d) => d.attributes?.rutas);
  // Transporte es otro servicio y lleva su propio botón, con el mismo criterio: lo decide el
  // atributo que el panel admin escribe en el vehículo según el contrato.
  const tieneTransporte =
    !esConductor && (admin || Object.values(devices).some((d) => d.attributes?.transporte));
  // Con los dos servicios la barra tiene seis botones. MUI le da a cada uno 80 px de ancho mínimo
  // y en un teléfono de 390 px el último queda fuera; se les quita ese mínimo para que entren.
  const compacto = tieneRutas && tieneTransporte;
  const accion = compacto ? { minWidth: 0, px: 0.5 } : undefined;

  const currentSelection = () => {
    if (location.pathname === `/settings/user/${user.id}`) {
      return 'account';
    }
    if (location.pathname.startsWith('/settings')) {
      return 'settings';
    }
    if (location.pathname.startsWith('/reports')) {
      return 'reports';
    }
    if (location.pathname.startsWith('/rutas') || location.pathname === '/mi-ruta') {
      return 'rutas';
    }
    if (location.pathname.startsWith('/transporte')) {
      return 'transporte';
    }
    if (location.pathname === '/') {
      return 'map';
    }
    return null;
  };

  const handleAccount = () => {
    setAnchorEl(null);
    navigate(`/settings/user/${user.id}`);
  };

  const handleLogout = async () => {
    setAnchorEl(null);

    const notificationToken = window.localStorage.getItem('notificationToken');
    if (notificationToken && !user.readonly) {
      window.localStorage.removeItem('notificationToken');
      const tokens = user.attributes.notificationTokens?.split(',') || [];
      if (tokens.includes(notificationToken)) {
        const updatedUser = {
          ...user,
          attributes: {
            ...user.attributes,
            notificationTokens:
              tokens.length > 1
                ? tokens.filter((it) => it !== notificationToken).join(',')
                : undefined,
          },
        };
        await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedUser),
        });
      }
    }

    await fetch('/api/session', { method: 'DELETE' });
    nativePostMessage('logout');
    navigate('/login');
    dispatch(sessionActions.updateUser(null));
  };

  const handleSelection = (event, value) => {
    switch (value) {
      case 'map':
        navigate('/');
        break;
      case 'reports': {
        let id = selectedDeviceId;
        if (id == null) {
          const deviceIds = Object.keys(devices);
          if (deviceIds.length === 1) {
            id = deviceIds[0];
          }
        }

        if (admin) {
          if (id != null) {
            navigate(`/reports/combined?deviceId=${id}`);
          } else {
            navigate('/reports/combined');
          }
        } else {
          const path = firstAllowedReportPath();
          navigate(id != null ? `${path}?deviceId=${id}` : path);
        }
        break;
      }
      case 'rutas':
        // Siempre a /rutas: esa pantalla ya sabe si quien entra planifica o conduce, y manda
        // al conductor a su ruta. Decidirlo acá obligaría a que el menú lo averiguara también.
        navigate('/rutas');
        break;
      case 'transporte':
        navigate('/transporte');
        break;
      case 'settings':
        navigate('/settings/preferences?menu=true');
        break;
      case 'account':
        setAnchorEl(event.currentTarget);
        break;
      case 'logout':
        handleLogout();
        break;
      default:
        break;
    }
  };

  return (
    <Paper square elevation={3} data-tour="menu-abajo">
      <BottomNavigation value={currentSelection()} onChange={handleSelection} showLabels>
        {/* El conductor ve dos cosas: su ruta y la puerta de salida.
            Mapa lleva a "/", que para él vuelve a su ruta —un botón que no hace nada—, y
            reportes y ajustes no son suyos: su trabajo es entregar. Esto es orden, no
            seguridad; lo que de verdad lo limita es que solo tiene permiso sobre el vehículo
            de la jornada que trae activa. */}
        {!esConductor && (
          <BottomNavigationAction
            label={t('mapTitle')}
            icon={
              <Badge color="error" variant="dot" overlap="circular" invisible={socket !== false}>
                <MapIcon />
              </Badge>
            }
            value="map"
            sx={accion}
          />
        )}
        {!esConductor && (
          <BottomNavigationAction
            label={t('reportTitle')}
            icon={<DescriptionIcon />}
            value="reports"
            sx={accion}
          />
        )}
        {/* Solo aparece si alguno de sus vehículos tiene el servicio contratado. Para todos
            los demás clientes, el menú queda exactamente como estaba. */}
        {tieneRutas && (
          <BottomNavigationAction label="Rutas" icon={<RouteIcon />} value="rutas" sx={accion} />
        )}
        {/* Transporte es otro servicio: su propio botón, y solo para quien lo contrató. */}
        {tieneTransporte && (
          <BottomNavigationAction
            label="Transporte"
            icon={<DirectionsBusIcon />}
            value="transporte"
            sx={accion}
          />
        )}
        {!deviceReadonly && !esConductor && (
          <BottomNavigationAction
            label={t('settingsTitle')}
            icon={<SettingsIcon />}
            value="settings"
            sx={accion}
          />
        )}
        {readonly ? (
          <BottomNavigationAction
            label={t('loginLogout')}
            icon={<ExitToAppIcon />}
            value="logout"
            sx={accion}
          />
        ) : (
          <BottomNavigationAction
            label={t('settingsUser')}
            icon={<PersonIcon />}
            value="account"
            sx={accion}
          />
        )}
      </BottomNavigation>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={handleAccount}>
          <Typography color="textPrimary">{t('settingsUser')}</Typography>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <Typography color="error">{t('loginLogout')}</Typography>
        </MenuItem>
      </Menu>
    </Paper>
  );
};

export default BottomMenu;
