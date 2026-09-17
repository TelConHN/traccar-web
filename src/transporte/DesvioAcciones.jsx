// Los dos botones de un desvío sin resolver: «Autorizar» (con motivo y, si se quiere, para
// toda la línea hasta una hora) y «Descartar». Se usan en el detalle del viaje y en Alertas.
import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from '@mui/material';
import transporteApi from './api';

const DesvioAcciones = ({ viajeId, desvio, onHecho }) => {
  const [abierto, setAbierto] = useState(null); // 'autorizar' | 'descartar'
  const [motivo, setMotivo] = useState('');
  const [todaLaLinea, setTodaLaLinea] = useState(false);
  const [hastaHora, setHastaHora] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    setError('');
    try {
      if (abierto === 'autorizar') {
        await transporteApi.autorizarDesvio(viajeId, desvio.id, {
          motivo: motivo.trim(),
          todaLaLinea,
          ...(todaLaLinea && hastaHora ? { hastaHora } : {}),
        });
      } else {
        await transporteApi.descartarDesvio(
          viajeId,
          desvio.id,
          motivo.trim() ? { motivo: motivo.trim() } : {},
        );
      }
      setAbierto(null);
      setMotivo('');
      onHecho?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
        <Button size="small" variant="outlined" onClick={() => setAbierto('autorizar')}>
          Autorizar
        </Button>
        <Button size="small" onClick={() => setAbierto('descartar')}>
          Descartar
        </Button>
      </Stack>
      <Dialog
        open={Boolean(abierto)}
        onClose={() => setAbierto(null)}
        fullWidth
        maxWidth="xs"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle>
          {abierto === 'autorizar' ? 'Autorizar el desvío' : 'Descartar el desvío'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              size="small"
              label={abierto === 'autorizar' ? 'Motivo' : 'Motivo (opcional)'}
              placeholder={abierto === 'autorizar' ? 'Calle cerrada por obra' : 'Rebote del GPS'}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {abierto === 'autorizar' && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={todaLaLinea}
                      onChange={(e) => setTodaLaLinea(e.target.checked)}
                    />
                  }
                  label="Para toda la línea: ningún bus alerta por esta zona hasta la hora indicada"
                />
                {todaLaLinea && (
                  <TextField
                    type="time"
                    size="small"
                    label="Hasta (vacío = una hora)"
                    value={hastaHora}
                    onChange={(e) => setHastaHora(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAbierto(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={enviando || (abierto === 'autorizar' && !motivo.trim())}
            onClick={confirmar}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DesvioAcciones;
