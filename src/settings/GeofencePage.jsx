import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Autocomplete,
  Typography,
  TextField,
  FormControlLabel,
  Checkbox,
  Radio,
  RadioGroup,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditItemView from './components/EditItemView';
import EditAttributesAccordion from './components/EditAttributesAccordion';
import { useTranslation } from '../common/components/LocalizationProvider';
import useGeofenceAttributes from '../common/attributes/useGeofenceAttributes';
import SettingsMenu from './components/SettingsMenu';
import SelectField from '../common/components/SelectField';
import { geofencesActions } from '../store';
import useSettingsStyles from './common/useSettingsStyles';
import { useAdministrator } from '../common/util/permissions';
import { useEffectAsync } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  createdByLabel,
  fetchAssignments,
  filterUsers,
  geofenceClients,
  renderUserOption,
} from '../other/geofenceAssignments';
import GeofenceDevicesPanel from '../other/GeofenceDevicesPanel';

const permission = (userId, geofenceId, method) =>
  fetchOrThrow('/api/permissions', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, geofenceId }),
  });

const GeofencePage = () => {
  const { classes } = useSettingsStyles();
  const dispatch = useDispatch();
  const t = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // ?cliente=ID: se dibujó desde la pestaña Usuarios con ese cliente elegido.
  const presetClientId = Number(searchParams.get('cliente')) || null;

  const admin = useAdministrator();
  const currentUserId = useSelector((state) => state.session.user.id);

  const geofenceAttributes = useGeofenceAttributes(t);

  const [item, setItem] = useState();
  const [data, setData] = useState();
  // De quién es: 'telcon' (pestaña Administración) o 'cliente' (+ clientId). Se aplica al guardar.
  const [owner, setOwner] = useState();
  const [clientId, setClientId] = useState(null);
  const [notice, setNotice] = useState();

  const reloadAssignments = async () => {
    const result = await fetchAssignments();
    setData(result);
    return result;
  };

  // Dueño según los vínculos actuales: si admin no la tiene y algún cliente sí, es de ese cliente.
  const deriveOwner = (result, preset) => {
    const linked = (result.geofenceUsers[id] || []).includes(currentUserId);
    const [firstClient] = geofenceClients(result, Number(id));
    if (preset && result.users[preset] && !firstClient) {
      setOwner('cliente');
      setClientId(preset);
    } else {
      setOwner(!linked && firstClient ? 'cliente' : 'telcon');
      setClientId(firstClient?.id || null);
    }
  };

  useEffectAsync(async () => {
    if (admin && id) {
      deriveOwner(await reloadAssignments(), presetClientId);
    }
  }, [admin, id]);

  // Recién dibujada para un cliente: el aviso a Telcon empieza apagado, como al elegir el cliente.
  useEffect(() => {
    if (presetClientId && item && item.attributes.notificarAdministracion === undefined) {
      setItem({ ...item, attributes: { ...item.attributes, notificarAdministracion: false } });
      setNotice('Geocerca nueva para este cliente: revisa el nombre y pulsa Guardar.');
    }
  }, [presetClientId, item]);

  const notifyAdministration = item?.attributes?.notificarAdministracion !== false;
  const setNotifyAdministration = (value) =>
    setItem({ ...item, attributes: { ...item.attributes, notificarAdministracion: value } });

  const handleOwnerChange = (value) => {
    setOwner(value);
    // Por defecto: lo de Telcon avisa a Telcon, lo de un cliente solo al cliente. Se puede cambiar.
    setNotifyAdministration(value === 'telcon');
  };

  const onItemSaved = async (result) => {
    dispatch(geofencesActions.update([result]));
    if (!admin || !data) {
      return false;
    }
    const users = data.geofenceUsers[result.id] || [];
    if (owner === 'telcon') {
      if (!users.includes(currentUserId)) {
        await permission(currentUserId, result.id, 'POST');
      }
      return false;
    }
    if (owner === 'cliente' && clientId) {
      const newClient = !users.includes(clientId);
      if (newClient) {
        await permission(clientId, result.id, 'POST');
      }
      // Sale de la pestaña Administración: ahora se encuentra en Usuarios, bajo ese cliente.
      if (users.includes(currentUserId)) {
        await permission(currentUserId, result.id, 'DELETE');
      }
      if (newClient) {
        // Quedarse para marcar los carros del cliente (no se agregan solos).
        setItem(result);
        await reloadAssignments();
        setNotice('Guardada para el cliente. Ahora marca abajo a qué carros suyos se aplica.');
        return true;
      }
    }
    return false;
  };

  const validate = () => item && item.name && (!admin || !id || owner !== 'cliente' || clientId);

  const clientOptions = data
    ? Object.values(data.users)
        .filter((user) => !user.administrator)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    : [];
  const createdBy = createdByLabel(data, item);

  return (
    <EditItemView
      endpoint="geofences"
      item={item}
      setItem={setItem}
      validate={validate}
      onItemSaved={onItemSaved}
      menu={<SettingsMenu />}
      breadcrumbs={['settingsTitle', 'sharedGeofence']}
    >
      {item && (
        <>
          {notice && (
            <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 1 }}>
              {notice}
            </Alert>
          )}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t('sharedRequired')}</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.name || ''}
                onChange={(event) => setItem({ ...item, name: event.target.value })}
                label={t('sharedName')}
              />
            </AccordionDetails>
          </Accordion>
          {admin && id && data && owner && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">¿De quién es esta geocerca?</Typography>
              </AccordionSummary>
              <AccordionDetails className={classes.details}>
                {createdBy && (
                  <Typography variant="body2" color="textSecondary">
                    Creada por {createdBy}
                  </Typography>
                )}
                <RadioGroup
                  value={owner}
                  onChange={(event) => handleOwnerChange(event.target.value)}
                >
                  <FormControlLabel
                    value="telcon"
                    control={<Radio />}
                    label="De Telcon (aparece en la pestaña Administración)"
                  />
                  <FormControlLabel
                    value="cliente"
                    control={<Radio />}
                    label="De un cliente (aparece en la pestaña Usuarios, bajo ese cliente)"
                  />
                </RadioGroup>
                {owner === 'cliente' && (
                  <Autocomplete
                    options={clientOptions}
                    value={clientOptions.find((user) => user.id === clientId) || null}
                    onChange={(event, user) => setClientId(user?.id || null)}
                    getOptionLabel={(user) => user.name || ''}
                    filterOptions={filterUsers}
                    renderOption={(props, user) => renderUserOption(props, user)}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Cliente"
                        helperText="Busca por nombre o correo"
                      />
                    )}
                  />
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={notifyAdministration}
                      onChange={(event) => setNotifyAdministration(event.target.checked)}
                    />
                  }
                  label="Avisar también a Telcon cuando un carro entre o salga"
                />
                <Typography variant="caption" color="textSecondary">
                  Apagada, el aviso solo le llega al cliente. Las cuentas de administración tienen
                  todos los carros, por eso sin esta casilla recibirían los avisos de todos los
                  clientes.
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
          {admin && id && data && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">Carros con esta geocerca</Typography>
              </AccordionSummary>
              <AccordionDetails className={classes.details}>
                <Typography variant="caption" color="textSecondary">
                  Estos cambios se aplican al instante, sin pulsar Guardar.
                </Typography>
                <GeofenceDevicesPanel
                  geofence={item}
                  data={data}
                  onChanged={reloadAssignments}
                  onClientRemoved={async () => deriveOwner(await reloadAssignments(), null)}
                  onGeofenceChanged={(result) =>
                    setItem({
                      ...item,
                      attributes: {
                        ...item.attributes,
                        autoAgregarUsuarios: result.attributes.autoAgregarUsuarios,
                      },
                    })
                  }
                />
              </AccordionDetails>
            </Accordion>
          )}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t('sharedExtra')}</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.description || ''}
                onChange={(event) => setItem({ ...item, description: event.target.value })}
                label={t('sharedDescription')}
              />
              <SelectField
                value={item.calendarId}
                onChange={(event) => setItem({ ...item, calendarId: Number(event.target.value) })}
                endpoint="/api/calendars"
                label={t('sharedCalendar')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={item.attributes.hide}
                    onChange={(e) =>
                      setItem({
                        ...item,
                        attributes: { ...item.attributes, hide: e.target.checked },
                      })
                    }
                  />
                }
                label={t('sharedFilterMap')}
              />
            </AccordionDetails>
          </Accordion>
          <EditAttributesAccordion
            attributes={item.attributes}
            setAttributes={(attributes) => setItem({ ...item, attributes })}
            definitions={geofenceAttributes}
          />
        </>
      )}
    </EditItemView>
  );
};

export default GeofencePage;
