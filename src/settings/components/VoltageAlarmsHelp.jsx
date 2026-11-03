import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Button, InputAdornment, TextField, Typography } from '@mui/material';
import { useTranslation } from '../../common/components/LocalizationProvider';
import { useAdministrator } from '../../common/util/permissions';
import { useCatch } from '../../reactHelper';
import { sessionActions } from '../../store';
import fetchOrThrow from '../../common/util/fetchOrThrow';

// Mismos valores que VoltageEventHandler y Keys.EVENT_LOW_VOLTAGE_THRESHOLD en el servidor.
const DEFAULT_THRESHOLD = 11.5;
const HYSTERESIS = 0.5;
const MIN_THRESHOLD = 5;
const MAX_THRESHOLD = 30;

const volts = (value) => `${Math.round(value * 100) / 100} V`;

// Reglas de las alarmas medidas por la plataforma, con el umbral general que esté guardado en el servidor.
// El administrador lo cambia aquí mismo: antes había que agregar a mano el atributo lowVoltageThreshold en
// Servidor, y el texto quedaba con 11.5 V aunque se cambiara.
const VoltageAlarmsHelp = () => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const admin = useAdministrator();
  const server = useSelector((state) => state.session.server);

  const saved = Number(server.attributes?.lowVoltageThreshold) || DEFAULT_THRESHOLD;
  const [value, setValue] = useState(String(saved));
  const [done, setDone] = useState(false);

  const parsed = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && parsed >= MIN_THRESHOLD && parsed <= MAX_THRESHOLD;

  const handleSave = useCatch(async () => {
    const response = await fetchOrThrow('/api/server', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...server,
        attributes: { ...server.attributes, lowVoltageThreshold: parsed },
      }),
    });
    dispatch(sessionActions.updateServer(await response.json()));
    setValue(String(parsed));
    setDone(true);
  });

  return (
    <Alert severity="info" sx={{ '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}>
      Las alarmas «medidas por la plataforma» no las manda el GPS: las calcula el sistema con el
      voltaje de la batería del carro («Energía» en el mapa).
      {admin && (
        // El botón va dentro del campo: la columna del formulario es angosta (~300 px aun en pantalla
        // grande) y un botón al lado bajaba a otra línea.
        <TextField
          fullWidth
          size="small"
          label="Voltaje bajo para todos los carros (V)"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDone(false);
          }}
          error={!valid}
          helperText={
            (!valid && `Entre ${MIN_THRESHOLD} y ${MAX_THRESHOLD} V`) || (done && 'Guardado')
          }
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button
                  size="small"
                  onClick={handleSave}
                  disabled={!valid || parsed === saved}
                  sx={{ mr: -1 }}
                >
                  {t('sharedSave')}
                </Button>
              </InputAdornment>
            ),
          }}
          sx={{ my: 1.5 }}
        />
      )}
      <Typography variant="body2" component="div" sx={{ mt: admin ? 0 : 1 }}>
        <b>Batería desconectada:</b> el voltaje cae a menos de 1 V. Vuelve a avisar si la batería
        estuvo puesta 30 segundos y la quitan otra vez.
        <br />
        <b>Voltaje bajo:</b> dos reportes seguidos bajo {volts(saved)} (uno solo es el bajón al
        arrancar). No se repite hasta 10 minutos seguidos en {volts(saved + HYSTERESIS)} o más.
        <br />
        <b>Batería reconectada:</b> vuelve a {volts(saved)} o más después de una desconexión.
        <br />
        Solo avisan después de ver la batería en {volts(saved)} o más una vez desde que se reinició
        el sistema. Para un carro distinto (camiones de 24 V: 23 V) se cambia en el dispositivo,
        «Umbral de voltaje bajo»; 0 lo apaga. Si el GPS también manda «{t('alarmPowerCut')}», pueden
        llegar los dos avisos por la misma desconexión.
      </Typography>
    </Alert>
  );
};

export default VoltageAlarmsHelp;
