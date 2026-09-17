// La lista de recorridos de la cuenta, con buscador. Desde acá se abre uno o se graba otro.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import AddIcon from '@mui/icons-material/Add';
import { useEffectAsync } from '../reactHelper';
import transporteApi from './api';

const km = (m) => `${(m / 1000).toFixed(1)} km`;

const Lineas = ({ puedeEditar, descripcion }) => {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffectAsync(async () => {
    try {
      setLineas(await transporteApi.lineas());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const filtradas = (lineas ?? []).filter((l) =>
    l.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <div>
          <Typography variant="h5" component="h1" fontWeight={600}>
            Recorridos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {descripcion}
          </Typography>
        </div>
        {puedeEditar && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/transporte/recorridos/nueva')}
          >
            Nuevo recorrido
          </Button>
        )}
      </Stack>

      {!lineas && !error && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {lineas && lineas.length > 3 && (
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar por nombre"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ mb: 1.5 }}
        />
      )}

      {lineas && lineas.length === 0 && (
        <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ p: 4, mt: 2 }}>
          <Avatar
            sx={{ width: 56, height: 56, bgcolor: 'action.selected', color: 'text.secondary' }}
          >
            <TimelineIcon />
          </Avatar>
          <Typography variant="h6">Todavía no hay recorridos</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 460 }}>
            El primero se crea grabando un viaje que el bus ya hizo: elegís el bus y el día, y el
            sistema saca el recorrido y propone las paradas. No hay que dibujar nada.
          </Typography>
          {puedeEditar && (
            <Button variant="contained" onClick={() => navigate('/transporte/recorridos/nueva')}>
              Grabar el primer recorrido
            </Button>
          )}
        </Stack>
      )}

      {filtradas.length > 0 && (
        <List disablePadding>
          {filtradas.map((l) => (
            <ListItemButton
              key={l.id}
              divider
              onClick={() => navigate(`/transporte/recorridos/${l.id}`)}
              sx={{ px: 1.5 }}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <TimelineIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={l.nombre}
                secondary={
                  <Stack
                    direction="row"
                    spacing={0.75}
                    useFlexGap
                    flexWrap="wrap"
                    sx={{ mt: 0.5 }}
                    component="span"
                  >
                    {l.variantes.map((v) => (
                      <Chip
                        key={v.id}
                        size="small"
                        variant="outlined"
                        label={`${v.nombre} · ${km(v.metros)} · ${v.paradas} paradas`}
                      />
                    ))}
                  </Stack>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
};

export default Lineas;
