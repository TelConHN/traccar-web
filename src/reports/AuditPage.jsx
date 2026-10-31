import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Link,
  ListItemText,
  Skeleton,
  Table,
  TableRow,
  TableCell,
  TableHead,
  TableBody,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { formatTime } from '../common/util/formatter';
import { prefixString } from '../common/util/stringUtils';
import { useTranslation, useTranslationKeys } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import ReportFilter, { updateReportParams } from './components/ReportFilter';
import usePersistedState from '../common/util/usePersistedState';
import ColumnSelect from './components/ColumnSelect';
import { useCatch, useEffectAsync } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import TableShimmer from '../common/components/TableShimmer';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';

const columnsArray = [
  ['actionTime', 'Hora'],
  ['user', 'Cuenta'],
  ['actionType', 'Acción'],
  ['object', 'Vehículo / objeto'],
  ['detail', 'Comando / detalle'],
  ['result', 'Respuesta del equipo'],
  ['address', 'IP'],
];
const columnsMap = new Map(columnsArray);

const actionTypes = [
  ['event', 'Evento del equipo'],
  ['command', 'Comando'],
  ['login', 'Inicio de sesión'],
  ['logout', 'Cierre de sesión'],
  ['denied', 'Acceso denegado'],
  ['create', 'Creó'],
  ['edit', 'Editó'],
  ['remove', 'Eliminó'],
  ['link', 'Vinculó'],
  ['unlink', 'Desvinculó'],
  ['report', 'Reporte'],
  ['accumulators', 'Ajustó odómetro/horas'],
  ['speedLimit', 'Límite de velocidad'],
  ['removePositions', 'Borró historial'],
  ['share', 'Compartió enlace'],
  ['passwordReset', 'Pidió restablecer contraseña'],
  ['passwordUpdate', 'Cambió contraseña (enlace)'],
  ['message', 'Envió mensaje'],
  ['server', 'Servidor'],
];
const actionTypeMap = new Map(actionTypes);

const objectTypeLabels = {
  device: 'Vehículo',
  user: 'Cuenta',
  group: 'Grupo',
  geofence: 'Geo-zona',
  driver: 'Conductor',
  calendar: 'Calendario',
  maintenance: 'Mantenimiento',
  notification: 'Notificación',
  command: 'Comando guardado',
  attribute: 'Atributo',
  order: 'Orden',
  token: 'Token',
};

// Nombre de cada campo en "Editó …"; uno que no está aquí se muestra con su nombre técnico.
const fieldLabels = {
  name: 'Nombre',
  uniqueId: 'Identificador (IMEI)',
  phone: 'Teléfono',
  model: 'Modelo',
  contact: 'Contacto',
  category: 'Categoría',
  disabled: 'Deshabilitado',
  expirationTime: 'Vence',
  groupId: 'Grupo',
  calendarId: 'Calendario',
  email: 'Correo',
  login: 'Usuario',
  readonly: 'Solo lectura',
  administrator: 'Administrador',
  deviceLimit: 'Límite de vehículos',
  userLimit: 'Límite de usuarios',
  deviceReadonly: 'Vehículos solo lectura',
  limitCommands: 'Limitar comandos',
  disableReports: 'Sin reportes',
  fixedEmail: 'Correo fijo',
  password: 'Contraseña',
  totpKey: 'Verificación en dos pasos',
  description: 'Descripción',
  area: 'Área',
  type: 'Tipo',
  always: 'Todos los vehículos',
  notificators: 'Canales',
  commandId: 'Comando',
  'attributes.speedLimitSupported': 'Limitador en el GPS',
  'attributes.speedLimitCommand': 'Plantilla del límite',
  'attributes.speedLimitEnabled': 'Servicio de límite de velocidad',
  'attributes.bloqueoMotor': 'Bloqueo de motor',
  'attributes.transporteVelocidad': 'Velocidad de Transporte',
  'attributes.autoUsers': 'Agregar sola a los carros de',
  'attributes.notifyAdministrators': 'Avisar a administración',
};

const fieldLabel = (field) =>
  fieldLabels[field] || (field.startsWith('attributes.') ? `Atributo ${field.slice(11)}` : field);

const fieldValue = (value) => {
  if (value == null || value === '') {
    return '(vacío)';
  }
  if (value === true || value === 'true') {
    return 'Sí';
  }
  if (value === false || value === 'false') {
    return 'No';
  }
  return String(value);
};

// Lo que manda o detecta el GPS (tc_events). Los primeros son los que más se buscan.
const eventTypes = [
  ['geofenceEnter', 'Entró a geocerca'],
  ['geofenceExit', 'Salió de geocerca'],
  ['deviceOffline', 'Se desconectó (fuera de línea)'],
  ['deviceOnline', 'Se conectó (en línea)'],
  ['deviceUnknown', 'Dejó de reportar (desconocido)'],
  ['deviceInactive', 'Inactivo mucho tiempo'],
  ['alarm', 'Alarma (todas)'],
  ['deviceOverspeed', 'Exceso de velocidad'],
  ['ignitionOn', 'Encendió el motor'],
  ['ignitionOff', 'Apagó el motor'],
  ['deviceMoving', 'Empezó a moverse'],
  ['deviceStopped', 'Se detuvo'],
  ['commandResult', 'Respuesta a un comando'],
  ['queuedCommandSent', 'Recibió un comando que estaba en cola'],
  ['driverChanged', 'Cambió el conductor'],
  ['maintenance', 'Mantenimiento requerido'],
  ['deviceFuelDrop', 'Bajó el combustible'],
  ['deviceFuelIncrease', 'Subió el combustible'],
  ['media', 'Envió foto / video / audio'],
];
const eventTypeMap = new Map(eventTypes);

// Las que el texto de la traducción no deja claro; las demás usan la traducción de Traccar.
const alarmLabels = {
  powerCut: 'Energía desconectada (le cortaron la batería del vehículo)',
  powerRestored: 'Energía restaurada',
  lowBattery: 'Batería interna del GPS baja',
  lowPower: 'Voltaje bajo (batería del vehículo)',
  powerOff: 'GPS apagado',
  powerOn: 'GPS encendido',
  removing: 'GPS retirado / desmontado',
  tampering: 'Manipulación del GPS',
  gpsAntennaCut: 'Antena GPS cortada',
  jamming: 'Interferencia de señal (inhibidor)',
  sos: 'Botón de pánico (SOS)',
  tow: 'Remolque / grúa',
  overspeed: 'Exceso de velocidad (avisado por el GPS)',
  geofenceEnter: 'Entró a geocerca (avisado por el GPS)',
  geofenceExit: 'Salió de geocerca (avisado por el GPS)',
  lowVoltage: 'Voltaje bajo (medido por la plataforma)',
  powerDisconnected: 'Batería desconectada (medida por la plataforma)',
  powerReconnected: 'Batería reconectada (medida por la plataforma)',
};
// Van primero en el filtro, después de "Alarma (todas)".
const mainAlarms = [
  'powerCut',
  'powerDisconnected',
  'powerRestored',
  'powerReconnected',
  'lowBattery',
  'lowPower',
  'lowVoltage',
  'removing',
  'sos',
];

const knotsToKph = (knots) => Math.round(Number(knots) * 1.852);

const channelLabels = {
  mail: 'correo',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  web: 'en la plataforma',
  firebase: 'app del teléfono',
  traccar: 'app Traccar',
  telegram: 'Telegram',
  pushover: 'Pushover',
  command: 'comando automático',
};

const deliveryText = ({ channel, status, error }) => {
  const name = channelLabels[channel] || channel;
  switch (status) {
    case 'sent':
      return `${name} enviado`;
    case 'failed':
      if (error && error.startsWith('Failed to get notificator')) {
        return `${name} FALLÓ (ese canal no está habilitado en el servidor)`;
      }
      return `${name} FALLÓ${error ? ` (${error})` : ''}`;
    case 'noPhone':
      return `${name} no salió: la cuenta no tiene teléfono`;
    case 'noApp':
      return `${name} no salió: no tiene la app instalada`;
    case 'blocked':
      return 'avisos bloqueados para esta cuenta en el servidor';
    default:
      return `${name}: ${status}`;
  }
};

const serverOperations = {
  reboot: 'Reinició el servidor',
  gc: 'Liberó memoria del servidor',
  cache: 'Consultó la caché del servidor',
  file: 'Subió un archivo a la web',
};

const AuditPage = () => {
  const { classes } = useReportStyles();
  const t = useTranslation();
  const theme = useTheme();
  // En teléfono, tableta y laptop chica (con el menú lateral abierto, a 1024 px) la tabla dejaba la
  // respuesta del equipo fuera de la pantalla: ahí cada registro es una tarjeta con todo a la vista.
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [searchParams, setSearchParams] = useSearchParams();

  // Solo id y nombre, y la misma lista mientras no cambien. El estado de los carros se actualiza
  // cada pocos segundos; si de eso salía una lista nueva, el buscador borraba lo que se escribía.
  const deviceOptions = useSelector(
    (state) => Object.values(state.devices.items).map(({ id, name }) => ({ id, name })),
    (a, b) =>
      a.length === b.length && a.every((item, i) => item.id === b[i].id && item.name === b[i].name),
  );
  const deviceList = useMemo(
    () => [...deviceOptions].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [deviceOptions],
  );

  const [users, setUsers] = useState([]);
  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/users');
    const list = await response.json();
    setUsers(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }, []);

  // El Autocomplete de MUI borra el texto que se está escribiendo cada vez que su valor llega como
  // arreglo nuevo, aunque tenga lo mismo. Por eso las selecciones se arman solo cuando cambian.
  const userIdsKey = searchParams.getAll('userId').join(',');
  const deviceIdsKey = searchParams.getAll('deviceId').join(',');
  const typesKey = searchParams.getAll('actionType').join(',');
  const userIds = useMemo(
    () => (userIdsKey ? userIdsKey.split(',').map(Number) : []),
    [userIdsKey],
  );
  const deviceIds = useMemo(
    () => (deviceIdsKey ? deviceIdsKey.split(',').map(Number) : []),
    [deviceIdsKey],
  );
  const selectedTypes = useMemo(() => (typesKey ? typesKey.split(',') : []), [typesKey]);
  const eventTypesKey = searchParams.getAll('eventType').join(',');
  const selectedEventTypes = useMemo(
    () => (eventTypesKey ? eventTypesKey.split(',') : []),
    [eventTypesKey],
  );

  // Las alarmas salen de las traducciones (alarmPowerCut → alarm:powerCut), como en Notificaciones.
  const alarmKeysText = useTranslationKeys((key) => key.startsWith('alarm')).join(',');
  const eventOptions = useMemo(() => {
    const alarms = alarmKeysText
      .split(',')
      .filter(Boolean)
      .map((key) => key.charAt(5).toLowerCase() + key.slice(6));
    const sorted = [
      ...mainAlarms.filter((alarm) => alarms.includes(alarm)),
      ...alarms.filter((alarm) => !mainAlarms.includes(alarm)).sort(),
    ];
    const keys = eventTypes.map(([key]) => key);
    const index = keys.indexOf('alarm');
    return [
      ...keys.slice(0, index + 1),
      ...sorted.map((alarm) => `alarm:${alarm}`),
      ...keys.slice(index + 1),
    ];
  }, [alarmKeysText]);

  const [columns, setColumns] = usePersistedState('auditColumnsV2', [
    'actionTime',
    'user',
    'actionType',
    'object',
    'detail',
    'result',
  ]);
  const [items, setItems] = useState([]);
  const [eventsTruncated, setEventsTruncated] = useState(0);
  const [loading, setLoading] = useState(false);

  const onShow = useCatch(async ({ from, to }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      userIds.forEach((id) => query.append('userId', id));
      deviceIds.forEach((id) => query.append('deviceId', id));
      selectedTypes.forEach((type) => query.append('actionType', type));
      selectedEventTypes.forEach((type) => query.append('eventType', type));
      const response = await fetchOrThrow(`/api/audit?${query.toString()}`);
      setEventsTruncated(Number(response.headers.get('X-Audit-Events-Truncated')) || 0);
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  });

  const translated = (key, fallback) => t(key) || fallback;

  const alarmLabel = (alarm) =>
    alarmLabels[alarm] || translated(prefixString('alarm', alarm || ''), alarm || '');

  const eventOptionLabel = (key) =>
    key.startsWith('alarm:')
      ? `Alarma: ${alarmLabel(key.slice(6))}`
      : eventTypeMap.get(key) || translated(prefixString('event', key), key);

  const commandLabel = (item) => {
    const type = item.attributes.commandType;
    const params = Object.entries(item.attributes)
      .filter(([key]) => key.startsWith('command.'))
      .map(([key, value]) => (key === 'command.data' ? value : `${key.slice(8)}: ${value}`));
    const parts = [];
    if (item.attributes.commandDescription) {
      parts.push(item.attributes.commandDescription);
    }
    if (type && (type !== 'custom' || !params.length)) {
      parts.push(translated(prefixString('command', type), type));
    }
    parts.push(...params);
    return parts.join(' · ');
  };

  const renderObject = (item) => {
    if (!item.objectType) {
      return '';
    }
    const typeLabel = objectTypeLabels[item.objectType] || item.objectType;
    const name =
      item.objectName ||
      (item.objectType === 'token' ? 'de acceso (enlace o app)' : `#${item.objectId}`);
    const owner = item.attributes.ownerType
      ? `${objectTypeLabels[item.attributes.ownerType] || item.attributes.ownerType}: ${
          item.ownerName || `#${item.attributes.ownerId}`
        }`
      : null;
    return (
      <>
        <Typography variant="body2">
          {item.objectType === 'device' ? name : `${typeLabel}: ${name}`}
        </Typography>
        {owner && (
          <Typography variant="caption" color="textSecondary">
            con {owner}
          </Typography>
        )}
        {item.attributes.groupId && (
          <Typography variant="caption" color="textSecondary" display="block">
            (enviado al grupo)
          </Typography>
        )}
      </>
    );
  };

  // Cada renglón es [texto, tono]: 'main' en letra normal, 'note' en gris, 'error' en rojo.
  // La pantalla y el Excel salen de aquí mismo.
  const eventLines = (attributes) => {
    const type = attributes.eventType;
    const lines = [];
    if (type === 'alarm') {
      lines.push([`Alarma: ${alarmLabel(attributes.alarm)}`, 'main']);
    } else {
      lines.push([eventTypeMap.get(type) || translated(prefixString('event', type), type), 'main']);
    }
    switch (type) {
      case 'geofenceEnter':
      case 'geofenceExit':
        lines.push([`Geocerca: ${attributes.geofenceName || `#${attributes.geofenceId}`}`, 'note']);
        break;
      case 'deviceOverspeed':
        if (attributes.speed != null) {
          lines.push([
            `${knotsToKph(attributes.speed)} km/h${
              attributes.speedLimit ? ` (límite ${knotsToKph(attributes.speedLimit)} km/h)` : ''
            }`,
            'note',
          ]);
        }
        break;
      case 'commandResult':
        if (attributes.result) {
          lines.push([attributes.result, 'note']);
        }
        break;
      case 'driverChanged':
        if (attributes.driverUniqueId) {
          lines.push([
            attributes.driverName
              ? `${attributes.driverName} (${attributes.driverUniqueId})`
              : `Tarjeta ${attributes.driverUniqueId} (sin conductor registrado)`,
            'note',
          ]);
        }
        break;
      case 'maintenance':
        if (attributes.maintenanceName) {
          lines.push([attributes.maintenanceName, 'note']);
        }
        break;
      case 'deviceFuelDrop':
      case 'deviceFuelIncrease':
        if (attributes.before != null) {
          lines.push([`${attributes.before} → ${attributes.after}`, 'note']);
        }
        break;
      case 'deviceInactive':
        if (attributes.lastUpdate) {
          lines.push([`Último reporte: ${formatTime(attributes.lastUpdate, 'minutes')}`, 'note']);
        }
        break;
      case 'media':
        if (attributes.media) {
          lines.push([attributes.media, 'note']);
        }
        break;
      default:
        break;
    }
    if (type === 'alarm' && attributes.power != null) {
      lines.push([
        `Voltaje: ${attributes.power} V${
          attributes.threshold ? ` (alarma bajo ${attributes.threshold} V)` : ''
        }`,
        'note',
      ]);
    }
    // Una línea por cuenta avisada, con lo que pasó en cada canal.
    const byUser = new Map();
    (attributes.notified || []).forEach((delivery) => {
      const key = delivery.userId;
      if (!byUser.has(key)) {
        byUser.set(key, { name: delivery.name || `#${delivery.userId}`, items: [] });
      }
      byUser.get(key).items.push(delivery);
    });
    byUser.forEach(({ name, items }) => {
      const failed = items.some((delivery) => delivery.status !== 'sent');
      lines.push([
        `Aviso a ${name}: ${items.map(deliveryText).join(', ')}`,
        failed ? 'error' : 'note',
      ]);
    });
    if (attributes.notifiedOmitted) {
      lines.push([
        `y ${attributes.notifiedOmitted} aviso(s) más que no cupieron en el registro`,
        'note',
      ]);
    }
    return lines;
  };

  const detailLines = (item) => {
    const { attributes } = item;
    const lines = [];
    switch (item.actionType) {
      case 'event':
        return eventLines(attributes);
      case 'command': {
        if (!attributes.commandType) {
          return [['No registrado (comando anterior a esta versión)', 'note']];
        }
        lines.push([commandLabel(item), 'main']);
        if (attributes.automatic) {
          const event = attributes.eventType
            ? ` (${translated(prefixString('event', attributes.eventType), attributes.eventType)})`
            : '';
          const notification = attributes.notificationDescription
            ? ` «${attributes.notificationDescription}»`
            : '';
          lines.push([`Automático: lo mandó la notificación${notification}${event}`, 'note']);
        }
        if (attributes.sms) {
          lines.push(['Por SMS', 'note']);
        }
        if (attributes.status === 'queued') {
          lines.push([
            item.queuedSentTime
              ? `Quedó en cola; se entregó ${formatTime(item.queuedSentTime, 'minutes')}`
              : 'En cola: el equipo no estaba conectado y aún no se ha entregado',
            'note',
          ]);
        }
        if (attributes.status === 'failed') {
          lines.push([
            `No se pudo enviar${attributes.error ? `: ${attributes.error}` : ''}`,
            'error',
          ]);
        }
        return lines;
      }
      case 'report': {
        const type = attributes.type || '';
        const scheduled = attributes.scheduled ? ' (programado)' : '';
        return [
          [
            `${translated(prefixString('report', type), type)} · ${attributes.from} → ${attributes.to}${scheduled}`,
            'main',
          ],
        ];
      }
      case 'edit':
        if (attributes.unchanged) {
          return [['Guardó sin cambiar nada', 'note']];
        }
        (attributes.changes || []).forEach(({ field, from, to }) => {
          lines.push([`${fieldLabel(field)}: ${fieldValue(from)} → ${fieldValue(to)}`, 'main']);
        });
        if (attributes.changesOmitted) {
          lines.push([
            `y ${attributes.changesOmitted} cambio(s) más que no cupieron en el registro`,
            'note',
          ]);
        }
        return lines;
      case 'speedLimit': {
        const from = attributes.from != null ? `${attributes.from} km/h` : 'Sin límite';
        const to = attributes.to != null ? `${attributes.to} km/h` : 'sin límite';
        lines.push([`${from} → ${to}`, 'main']);
        lines.push([
          attributes.hardware
            ? 'Se mandó también al GPS (el comando aparece aparte)'
            : 'Guardado en la plataforma',
          'note',
        ]);
        return lines;
      }
      case 'accumulators': {
        const km = (meters) => (meters != null ? `${(meters / 1000).toFixed(1)} km` : '(vacío)');
        const hours = (ms) => (ms != null ? `${Math.round(ms / 3600000)} h` : '(vacío)');
        if (attributes.totalDistance != null) {
          lines.push([
            `Odómetro: ${km(attributes.previousTotalDistance)} → ${km(attributes.totalDistance)}`,
            'main',
          ]);
        }
        if (attributes.hours != null) {
          lines.push([
            `Horas de motor: ${hours(attributes.previousHours)} → ${hours(attributes.hours)}`,
            'main',
          ]);
        }
        return lines;
      }
      case 'removePositions':
        if (attributes.positionId) {
          return [
            [
              `Borró un punto del historial${attributes.from ? ` (${attributes.from})` : ''}`,
              'main',
            ],
          ];
        }
        return [[`Borró el historial del ${attributes.from} al ${attributes.to}`, 'main']];
      case 'share':
        return [
          [
            `Enlace para ver sin cuenta${attributes.expiration ? `, vence ${attributes.expiration}` : ''}`,
            'main',
          ],
        ];
      case 'passwordReset':
        lines.push([`Para ${attributes.email || '(sin correo)'}`, 'main']);
        if (!item.userId) {
          lines.push(['Ese correo no es de ninguna cuenta', 'note']);
        }
        return lines;
      case 'passwordUpdate':
        return [['Cambió la contraseña con el enlace del correo', 'main']];
      case 'message': {
        // Los avisos de cobro del panel salen por acá: se nombra a quién le llegó, no solo cuántos.
        const ids = (String(attributes.users || '').match(/\d+/g) || []).map(Number);
        const nombres = ids.map((id) => users.find((u) => u.id === id)?.name || `cuenta ${id}`);
        return [
          [
            `Por ${channelLabels[attributes.notificator] || attributes.notificator} a ${
              nombres.length ? nombres.join(', ') : `${attributes.recipients} cuenta(s)`
            }${attributes.subject ? `: «${attributes.subject}»` : ''}`,
            'main',
          ],
        ];
      }
      case 'server':
        return [
          [
            `${serverOperations[attributes.operation] || attributes.operation}${
              attributes.detail ? `: ${attributes.detail}` : ''
            }`,
            'main',
          ],
        ];
      case 'denied':
        return attributes.email ? [[`Intentó entrar como ${attributes.email}`, 'main']] : [];
      default:
        return [];
    }
  };

  const toneColor = { main: undefined, note: 'textSecondary', error: 'error' };

  const renderDetail = (item) => {
    const lines = detailLines(item);
    if (!lines.length) {
      return '';
    }
    return (
      <>
        {lines.map(([text, tone]) => (
          <Typography
            key={text}
            variant={tone === 'main' ? 'body2' : 'caption'}
            color={toneColor[tone]}
            display="block"
          >
            {text}
          </Typography>
        ))}
        {item.actionType === 'event' && item.attributes.positionId && (
          <Link
            variant="caption"
            component={RouterLink}
            to={`/position/${item.attributes.positionId}`}
          >
            Ver ubicación
          </Link>
        )}
      </>
    );
  };

  const renderResult = (item) => {
    if (item.actionType !== 'command') {
      return '';
    }
    if (item.commandResult != null) {
      return (
        <>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {item.commandResult}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatTime(item.commandResultTime)}
          </Typography>
        </>
      );
    }
    if (item.attributes.status === 'failed') {
      return '';
    }
    if (item.attributes.status === 'queued' && !item.queuedSentTime) {
      return (
        <Typography variant="caption" color="textSecondary">
          Pendiente
        </Typography>
      );
    }
    return (
      <Typography variant="caption" color="textSecondary">
        Sin respuesta
      </Typography>
    );
  };

  const renderCell = (item, key) => {
    switch (key) {
      case 'actionTime':
        return formatTime(item.actionTime, 'minutes');
      case 'user':
        if (item.actionType === 'event') {
          return (
            <Typography variant="body2" color="textSecondary">
              El GPS (automático)
            </Typography>
          );
        }
        if (!item.userId) {
          return '';
        }
        return (
          <>
            <Typography variant="body2">{item.userName || `#${item.userId}`}</Typography>
            {item.userEmail && item.userEmail !== item.userName && (
              <Typography variant="caption" color="textSecondary" display="block">
                {item.userEmail}
              </Typography>
            )}
            {item.attributes.actor && (
              <Typography variant="caption" color="primary" display="block">
                Pedido por {item.attributes.actor}
              </Typography>
            )}
          </>
        );
      case 'actionType':
        return actionTypeMap.get(item.actionType) || item.actionType;
      case 'object':
        return renderObject(item);
      case 'detail':
        return renderDetail(item);
      case 'result':
        return renderResult(item);
      default:
        return item[key];
    }
  };

  // En el teléfono cada registro se lee de arriba abajo: de qué tipo es (color), qué pasó en letra
  // grande y debajo quién, sobre qué y el detalle, con la etiqueta al lado del dato. Antes era
  // «hora · acción» y debajo bloques sueltos con el título encima, que costaba relacionar.
  const cardKind = (item) => {
    switch (item.actionType) {
      case 'event':
        return ['Evento del GPS', 'warning'];
      case 'command':
      case 'speedLimit':
        return ['Comando', 'primary'];
      case 'denied':
        return ['Acceso', 'error'];
      case 'login':
      case 'logout':
      case 'passwordReset':
      case 'passwordUpdate':
        return ['Acceso', 'default'];
      default:
        return ['Cambio', 'info'];
    }
  };

  const cardRow = (label, value) => (
    <Box key={label} sx={{ display: 'flex', gap: 1.5, mt: 0.75 }}>
      <Typography variant="body2" color="textSecondary" sx={{ flexShrink: 0, width: 76 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, flexGrow: 1, wordBreak: 'break-word' }}>{value}</Box>
    </Box>
  );

  const renderCard = (item) => {
    const [kind, kindColor] = cardKind(item);
    const isEvent = item.actionType === 'event';
    const lines = columns.includes('detail') ? detailLines(item) : [];
    // En un evento el primer renglón del detalle («Encendió el motor») es lo que pasó.
    const title = isEvent
      ? (lines[0] || detailLines(item)[0] || [''])[0]
      : actionTypeMap.get(item.actionType) || item.actionType;
    const rest = isEvent ? lines.slice(1) : lines;
    const rows = [];
    if (columns.includes('user') && !isEvent) {
      const who = renderCell(item, 'user');
      if (who) {
        rows.push(cardRow('Quién', who));
      }
    }
    if (columns.includes('object') && item.objectType) {
      rows.push(cardRow(item.objectType === 'device' ? 'Vehículo' : 'Sobre', renderObject(item)));
    }
    if (rest.length || (isEvent && item.attributes.positionId && columns.includes('detail'))) {
      rows.push(
        cardRow(
          'Detalle',
          <>
            {rest.map(([text, tone]) => (
              <Typography key={text} variant="body2" color={toneColor[tone]} display="block">
                {text}
              </Typography>
            ))}
            {isEvent && item.attributes.positionId && (
              <Link
                variant="body2"
                component={RouterLink}
                to={`/position/${item.attributes.positionId}`}
              >
                Ver ubicación
              </Link>
            )}
          </>,
        ),
      );
    }
    if (columns.includes('result') && item.actionType === 'command') {
      const result = renderResult(item);
      if (result) {
        rows.push(cardRow('Respuesta', result));
      }
    }
    if (columns.includes('address') && item.address) {
      rows.push(cardRow('IP', item.address));
    }
    return (
      <Box key={item.id} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip size="small" label={kind} color={kindColor} variant="outlined" />
          {columns.includes('actionTime') && (
            <Typography variant="body2" color="textSecondary" sx={{ ml: 'auto' }}>
              {formatTime(item.actionTime, 'minutes')}
            </Typography>
          )}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 0.75, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {rows}
      </Box>
    );
  };

  // Lo mismo que se ve en pantalla, pero en texto plano para Excel.
  const textCell = (item, key) => {
    const { attributes } = item;
    switch (key) {
      case 'actionTime':
        return formatTime(item.actionTime, 'minutes');
      case 'user':
        if (item.actionType === 'event') {
          return 'El GPS (automático)';
        }
        if (!item.userId) {
          return '';
        }
        return [
          item.userName || `#${item.userId}`,
          item.userEmail !== item.userName && item.userEmail,
          attributes.actor && `pedido por ${attributes.actor}`,
        ]
          .filter(Boolean)
          .join(' — ');
      case 'actionType':
        return actionTypeMap.get(item.actionType) || item.actionType;
      case 'object': {
        if (!item.objectType) {
          return '';
        }
        const name =
          item.objectName ||
          (item.objectType === 'token' ? 'de acceso (enlace o app)' : `#${item.objectId}`);
        const parts = [
          item.objectType === 'device'
            ? name
            : `${objectTypeLabels[item.objectType] || item.objectType}: ${name}`,
        ];
        if (attributes.ownerType) {
          parts.push(
            `con ${objectTypeLabels[attributes.ownerType] || attributes.ownerType}: ${
              item.ownerName || `#${attributes.ownerId}`
            }`,
          );
        }
        if (attributes.groupId) {
          parts.push('(enviado al grupo)');
        }
        return parts.join(' ');
      }
      case 'detail':
        return detailLines(item)
          .map(([text]) => text)
          .join(' — ');
      case 'result':
        if (item.commandResult != null) {
          return `${item.commandResult} (${formatTime(item.commandResultTime)})`;
        }
        if (item.actionType !== 'command' || attributes.status === 'failed') {
          return '';
        }
        return attributes.status === 'queued' && !item.queuedSentTime
          ? 'Pendiente'
          : 'Sin respuesta';
      default:
        return item[key] ?? '';
    }
  };

  const onExport = useCatch(async () => {
    const rows = items.map((item) => {
      const row = {};
      columns.forEach((key) => {
        row[columnsMap.get(key)] = textCell(item, key);
      });
      return row;
    });
    await exportExcel(t('reportAudit'), 'auditoria.xlsx', new Map([['Auditoría', rows]]), theme);
  });

  const selectedUsers = useMemo(
    () => users.filter((user) => userIds.includes(user.id)),
    [users, userIds],
  );
  const selectedDevices = useMemo(
    () => deviceList.filter((device) => deviceIds.includes(device.id)),
    [deviceList, deviceIds],
  );

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportAudit']}>
      <div className={classes.header}>
        <ReportFilter onShow={onShow} onExport={onExport} deviceType="none" loading={loading}>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={users}
              value={selectedUsers}
              onChange={(_, value) =>
                updateReportParams(
                  searchParams,
                  setSearchParams,
                  'userId',
                  value.map((user) => user.id),
                )
              }
              getOptionLabel={(user) => user.name || user.email || ''}
              filterOptions={(options, { inputValue }) => {
                const text = inputValue.trim().toLowerCase();
                return options.filter((user) =>
                  `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(text),
                );
              }}
              renderOption={(props, user) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <ListItemText
                      primary={user.name}
                      secondary={user.email !== user.name ? user.email : null}
                    />
                  </li>
                );
              }}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Ninguna cuenta coincide"
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Clientes / cuentas"
                  placeholder={selectedUsers.length ? undefined : 'Todas'}
                  helperText="Lo que hizo la cuenta, lo que se hizo a sus carros y los eventos de sus carros"
                />
              )}
            />
          </div>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={deviceList}
              value={selectedDevices}
              onChange={(_, value) =>
                updateReportParams(
                  searchParams,
                  setSearchParams,
                  'deviceId',
                  value.map((device) => device.id),
                )
              }
              getOptionLabel={(device) => device.name || ''}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Ningún vehículo coincide"
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vehículos"
                  placeholder={selectedDevices.length ? undefined : 'Todos'}
                />
              )}
            />
          </div>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={actionTypes.map(([key]) => key)}
              value={selectedTypes}
              onChange={(_, value) =>
                updateReportParams(searchParams, setSearchParams, 'actionType', value)
              }
              getOptionLabel={(key) => actionTypeMap.get(key) || key}
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Acciones"
                  placeholder={selectedTypes.length ? undefined : 'Todas'}
                />
              )}
            />
          </div>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={eventOptions}
              value={selectedEventTypes}
              onChange={(_, value) =>
                updateReportParams(searchParams, setSearchParams, 'eventType', value)
              }
              getOptionLabel={eventOptionLabel}
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Eventos del equipo"
                  placeholder={selectedEventTypes.length ? undefined : 'Todos'}
                  helperText="Geocercas, alarmas, desconexión… Si solo elige eventos, salen solo eventos"
                />
              )}
            />
          </div>
          <ColumnSelect
            columns={columns}
            setColumns={setColumns}
            columnsArray={columnsArray}
            rawValues
          />
        </ReportFilter>
      </div>
      {eventsTruncated > 0 && !loading && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
          Hay más eventos del equipo de los que se pueden mostrar: aparecen solo los primeros{' '}
          {eventsTruncated.toLocaleString()}. Acorte las fechas o elija vehículos, clientes o tipos
          de evento para verlos todos.
        </Alert>
      )}
      {narrow ? (
        <Box>
          {!loading
            ? items.map((item) => renderCard(item))
            : [0, 1, 2].map((index) => (
                <Box key={index} sx={{ px: 2, py: 1.5 }}>
                  <Skeleton />
                  <Skeleton width="60%" />
                </Box>
              ))}
        </Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((key) => (
                <TableCell key={key}>{columnsMap.get(key)}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading ? (
              items.map((item) => (
                <TableRow key={item.id}>
                  {columns.map((key) => (
                    <TableCell key={key} sx={{ verticalAlign: 'top', maxWidth: 320 }}>
                      {renderCell(item, key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableShimmer columns={columns.length} />
            )}
          </TableBody>
        </Table>
      )}
    </PageLayout>
  );
};

export default AuditPage;
