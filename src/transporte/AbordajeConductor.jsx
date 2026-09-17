// En «Mi ruta», dentro de un viaje en curso: quién sube en cada parada y los botones «Subió» /
// «No vino». El servidor solo lo acepta con el GPS del bus en esa parada, y lo dice si no.
import { useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { useEffectAsync } from '../reactHelper';
import transporteApi from './api';

const AbordajeConductor = ({ viajeId, paradas }) => {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setLista(await transporteApi.abordaje(viajeId));
    } catch {
      setLista([]);
    }
  };
  useEffectAsync(cargar, [viajeId]);

  const marcar = async (pasajeroId, estado) => {
    setError('');
    try {
      await transporteApi.marcarAbordaje(viajeId, pasajeroId, estado);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  if (lista.length === 0) return null;
  // La próxima parada con gente sin marcar va primero: es la que el conductor necesita ya.
  const conGente = paradas.filter((p) => lista.some((x) => x.paradaId === p.id));

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {error && (
        <Alert severity="warning" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {conGente.map((p) => (
        <div key={p.id}>
          <Typography variant="caption" color="text.secondary">
            {p.orden}. {p.nombre}
          </Typography>
          {lista
            .filter((x) => x.paradaId === p.id)
            .map((x) => (
              <Stack
                key={x.pasajeroId}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ py: 0.25 }}
              >
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {x.nombre}
                </Typography>
                <Button
                  size="small"
                  variant={x.estado === 'subio' ? 'contained' : 'outlined'}
                  color="success"
                  onClick={() => marcar(x.pasajeroId, 'subio')}
                >
                  Subió
                </Button>
                <Button
                  size="small"
                  variant={x.estado === 'no_vino' ? 'contained' : 'outlined'}
                  color="warning"
                  onClick={() => marcar(x.pasajeroId, 'no_vino')}
                >
                  No vino
                </Button>
              </Stack>
            ))}
        </div>
      ))}
    </Stack>
  );
};

export default AbordajeConductor;
