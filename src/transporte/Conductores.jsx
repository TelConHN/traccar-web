// Conductores de Transporte: la misma gente de la cuenta que en Rutas (un solo alta, un solo
// usuario), vista con lo que le importa a Transporte: qué bus y qué horario tiene cada uno.
//
// El alta y la edición usan el mismo diálogo de Rutas a propósito: si hubiera dos formularios,
// tarde o temprano pedirían cosas distintas.
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import { useEffectAsync } from '../reactHelper';
import rutasApi from '../rutas/api';
import NuevoUsuarioDialog from '../rutas/NuevoUsuarioDialog';
import transporteApi from './api';

const Conductores = ({ perfil }) => {
  const [gente, setGente] = useState(null);
  const [turnos, setTurnos] = useState([]);
  const [error, setError] = useState('');
  const [dialogo, setDialogo] = useState(null); // { usuario? }

  const cargar = async () => {
    try {
      const [p, t] = await Promise.all([rutasApi.perfil(), transporteApi.turnos()]);
      setGente(p.conductores ?? []);
      setTurnos(t);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffectAsync(cargar, [perfil?.clienteElegido?.id]);

  const puedeGestionar = perfil.gestionaUsuarios;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2 }}
      >
        <div>
          <Typography variant="h5" component="h1" fontWeight={600}>
            Conductores
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cada conductor entra con su usuario y ve en «Mi ruta» sus horarios del día y sus
            paradas. El bus se le da al asignarlo a un horario.
          </Typography>
        </div>
        {puedeGestionar && (
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setDialogo({})}>
            Nuevo conductor
          </Button>
        )}
      </Stack>

      {!gente && !error && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {gente && gente.length === 0 && (
        <Alert severity="info">
          Todavía no hay conductores.{' '}
          {puedeGestionar
            ? 'Creá el primero y después asignalo a un horario.'
            : 'Pedile a la cuenta principal que los cree.'}
        </Alert>
      )}

      {gente && gente.length > 0 && (
        <List disablePadding component={Paper} variant="outlined">
          {gente.map((c, i) => {
            const suyos = turnos.filter((t) => t.conductorUserId === c.id);
            return (
              <ListItem
                key={c.id}
                divider={i < gente.length - 1}
                secondaryAction={
                  puedeGestionar && (
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => setDialogo({ usuario: c })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{c.nombre}</span>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={c.rol === 'encargado' ? 'Encargado' : 'Conductor'}
                      />
                    </Stack>
                  }
                  secondary={
                    <Stack
                      direction="row"
                      spacing={0.5}
                      useFlexGap
                      flexWrap="wrap"
                      component="span"
                      sx={{ mt: 0.5, pr: 6 }}
                    >
                      {suyos.length === 0 && (
                        <Typography variant="caption" color="text.secondary" component="span">
                          Sin horarios de Transporte
                        </Typography>
                      )}
                      {suyos.map((t) => (
                        <Chip
                          key={t.id}
                          size="small"
                          label={`${t.horaInicio}–${t.horaFin} · ${t.vehiculo} · ${t.variante.linea.nombre}`}
                        />
                      ))}
                    </Stack>
                  }
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <NuevoUsuarioDialog
        open={Boolean(dialogo)}
        usuario={dialogo?.usuario}
        onClose={() => setDialogo(null)}
        onCreado={cargar}
      />
    </Box>
  );
};

export default Conductores;
