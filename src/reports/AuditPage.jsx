import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
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
import { useTranslation } from '../common/components/LocalizationProvider';
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

  const [columns, setColumns] = usePersistedState('auditColumnsV2', [
    'actionTime',
    'user',
    'actionType',
    'object',
    'detail',
    'result',
  ]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const onShow = useCatch(async ({ from, to }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      userIds.forEach((id) => query.append('userId', id));
      deviceIds.forEach((id) => query.append('deviceId', id));
      selectedTypes.forEach((type) => query.append('actionType', type));
      const response = await fetchOrThrow(`/api/audit?${query.toString()}`);
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  });

  const translated = (key, fallback) => t(key) || fallback;

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
    const name = item.objectName || `#${item.objectId}`;
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
  const detailLines = (item) => {
    const { attributes } = item;
    const lines = [];
    switch (item.actionType) {
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
      case 'message':
        return [
          [
            `Por ${attributes.notificator} a ${attributes.recipients} cuenta(s)${
              attributes.subject ? `: «${attributes.subject}»` : ''
            }`,
            'main',
          ],
        ];
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
    return lines.map(([text, tone]) => (
      <Typography
        key={text}
        variant={tone === 'main' ? 'body2' : 'caption'}
        color={toneColor[tone]}
        display="block"
      >
        {text}
      </Typography>
    ));
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

  // Lo mismo que se ve en pantalla, pero en texto plano para Excel.
  const textCell = (item, key) => {
    const { attributes } = item;
    switch (key) {
      case 'actionTime':
        return formatTime(item.actionTime, 'minutes');
      case 'user':
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
        const name = item.objectName || `#${item.objectId}`;
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
                  helperText="Lo que hizo la cuenta y lo que se hizo a sus carros"
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
          <ColumnSelect
            columns={columns}
            setColumns={setColumns}
            columnsArray={columnsArray}
            rawValues
          />
        </ReportFilter>
      </div>
      {narrow ? (
        <Box>
          {!loading
            ? items.map((item) => (
                <Box key={item.id} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2">
                    {columns.includes('actionTime') && formatTime(item.actionTime, 'minutes')}
                    {columns.includes('actionTime') && columns.includes('actionType') && ' · '}
                    {columns.includes('actionType') && renderCell(item, 'actionType')}
                  </Typography>
                  {columns
                    .filter((key) => key !== 'actionTime' && key !== 'actionType')
                    .map((key) => {
                      const value = renderCell(item, key);
                      if (value === '' || value == null) {
                        return null;
                      }
                      return (
                        <Box key={key} sx={{ mt: 1 }}>
                          <Typography variant="caption" color="textSecondary">
                            {columnsMap.get(key)}
                          </Typography>
                          <Box sx={{ wordBreak: 'break-word' }}>{value}</Box>
                        </Box>
                      );
                    })}
                </Box>
              ))
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
