// Configuración → «El conductor marca quién subió». Opcional por cuenta: el GPS no sabe quién
// sube, y pedirle al conductor que marque lo distrae; hay clientes que lo quieren igual.
import { useState } from 'react';
import { Alert, Box, FormControlLabel, Switch, Typography } from '@mui/material';
import transporteApi from './api';

const Abordaje = ({ activo, onCambio }) => {
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = async (valor) => {
    setGuardando(true);
    setError('');
    try {
      await transporteApi.configurarAbordaje(valor);
      onCambio(valor);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 3, maxWidth: 820 }}>
      <Typography variant="h6" component="h2" fontWeight={600} sx={{ mt: 1 }}>
        Marca de abordaje
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={Boolean(activo)}
            disabled={guardando}
            onChange={(e) => cambiar(e.target.checked)}
          />
        }
        label="El conductor marca en cada parada quién subió y quién no vino"
      />
      <Typography variant="body2" color="text.secondary">
        Solo se acepta con el GPS del bus en esa parada. Sin esto, el sistema igual dice si el bus
        se detuvo en cada parada; lo que no sabe es quién subió.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default Abordaje;
