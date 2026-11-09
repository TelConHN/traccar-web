// La barra de arriba de Rutas y Transporte que solo ve un administrador: sobre qué cliente trabaja.
//
// Dice con todas las letras qué pasa con lo que se crea —queda a nombre de ese cliente—, porque es
// justo lo que un administrador podría no esperar: sin ese aviso, armar una ruta «de prueba» con un
// cliente elegido se la dejaría en la cuenta del cliente.
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { clientesParaAdmin, guardarClienteAdmin } from './clienteAdmin';

const TODOS = { id: null, nombre: 'Todos los clientes' };

const SelectorCliente = ({ servicio, cliente }) => {
  const telefono = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    clientesParaAdmin(servicio)
      .then((lista) => {
        if (!vigente) return;
        setClientes(lista);
        // Un cliente guardado que ya no tiene el servicio (contrato cancelado) no puede quedar
        // elegido: cada petición fallaría con «ese cliente no existe».
        if (cliente && !lista.some((c) => c.id === cliente.id)) guardarClienteAdmin(null);
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [servicio, cliente]);

  const opciones = useMemo(() => [TODOS, ...clientes], [clientes]);
  const valor = cliente ? (clientes.find((c) => c.id === cliente.id) ?? cliente) : TODOS;
  const cuantos = (c) => (servicio === 'rutas' ? c.vehiculosRutas : c.vehiculosTransporte);

  return (
    <Paper
      square
      elevation={0}
      sx={{
        px: 2,
        py: { xs: 1.5, md: 1.25 },
        flexShrink: 0,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        rowGap={{ xs: 0.5, md: 1.5 }}
        useFlexGap
        flexWrap="wrap"
      >
        {!telefono && (
          <>
            <AdminPanelSettingsIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Administrador · trabajando para
            </Typography>
          </>
        )}
        <Autocomplete
          size="small"
          sx={{ flexGrow: 1, minWidth: { xs: '100%', md: 240 }, maxWidth: { md: 440 } }}
          options={opciones}
          value={valor}
          loading={cargando}
          disableClearable
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionLabel={(o) => o.nombre}
          onChange={(_e, opcion) => guardarClienteAdmin(opcion?.id ? opcion : null)}
          noOptionsText="Ningún cliente tiene este servicio todavía"
          renderOption={(props, o) => {
            const { key, ...resto } = props;
            return (
              <Box component="li" key={key} {...resto}>
                <div>
                  <Typography variant="body2" fontWeight={o.id ? 400 : 600}>
                    {o.nombre}
                  </Typography>
                  {o.id && (
                    <Typography variant="caption" color="text.secondary">
                      {o.correo} · {cuantos(o)} {cuantos(o) === 1 ? 'vehículo' : 'vehículos'}
                    </Typography>
                  )}
                </div>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={telefono ? 'Administrador · trabajando para' : undefined}
              placeholder="Elegí un cliente"
            />
          )}
        />
        {cliente && telefono && (
          <Typography variant="caption" color="primary">
            Lo que crees queda a nombre de este cliente
          </Typography>
        )}
        {cliente && !telefono && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label="Lo que crees queda a nombre de este cliente"
          />
        )}
        {!cliente && (
          <Typography variant="caption" color="text.secondary">
            Viendo todos: para crear algo, elegí un cliente.
          </Typography>
        )}
        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

export default SelectorCliente;
