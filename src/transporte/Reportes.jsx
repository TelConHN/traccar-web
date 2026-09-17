// Reportes: cumplimiento por recorrido, por bus y por conductor, y la lista de viajes. Excel,
// CSV e impresión, como en Rutas.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useEffectAsync } from '../reactHelper';
import { exportarExcelTransporte, exportarCsvTransporte } from './exportar';
import { ESTADO_VIAJE } from './ViajeDetalle';
import transporteApi from './api';

const hoy = () => new Date().toLocaleDateString('en-CA');
const haceDias = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
const hora = (d) =>
  d ? new Date(d).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

const TablaGrupo = ({ filas, etiqueta }) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        <TableCell>{etiqueta}</TableCell>
        <TableCell align="right">Viajes</TableCell>
        <TableCell align="right">Paradas</TableCell>
        <TableCell align="right">Se detuvo</TableCell>
        <TableCell align="right">Sin detenerse</TableCell>
        <TableCell align="right">Sin datos</TableCell>
        <TableCell align="right">Desvíos</TableCell>
        <TableCell align="right">Excesos</TableCell>
        <TableCell align="right">Detenciones</TableCell>
        <TableCell align="right">Cumplimiento</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {filas.map((g) => (
        <TableRow key={g.clave} hover>
          <TableCell>{g.nombre}</TableCell>
          <TableCell align="right">
            {g.viajes}
            {g.sinDatos ? ` (${g.sinDatos} sin datos)` : ''}
          </TableCell>
          <TableCell align="right">{g.paradas}</TableCell>
          <TableCell align="right">{g.seDetuvo}</TableCell>
          <TableCell align="right">
            {g.sinDetenerse}
            {g.obligatoriasSaltadas ? ` (${g.obligatoriasSaltadas} oblig.)` : ''}
          </TableCell>
          <TableCell align="right">{g.paradasSinDatos}</TableCell>
          <TableCell align="right">{g.desvios}</TableCell>
          <TableCell align="right">{g.excesos ?? 0}</TableCell>
          <TableCell align="right">{g.detencionesFuera ?? 0}</TableCell>
          <TableCell align="right">
            {g.paradas ? `${Math.round((g.seDetuvo / g.paradas) * 100)} %` : '—'}
          </TableCell>
        </TableRow>
      ))}
      {filas.length === 0 && (
        <TableRow>
          <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 3 }}>
            Sin viajes terminados en estos días.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  </Table>
);

const Reportes = ({ perfil }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [desde, setDesde] = useState(haceDias(6));
  const [hasta, setHasta] = useState(hoy());
  const [pestana, setPestana] = useState(0);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);

  useEffectAsync(async () => {
    try {
      setReporte(await transporteApi.reportes(desde, hasta));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [desde, hasta, perfil?.clienteElegido?.id]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 1.5 }}
      >
        <Typography variant="h5" component="h1" fontWeight={600}>
          Reportes
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            type="date"
            size="small"
            label="Desde"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label="Hasta"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!reporte}
            onClick={(e) => setMenu(e.currentTarget)}
          >
            Exportar
          </Button>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem
              onClick={() => {
                exportarExcelTransporte(reporte, theme);
                setMenu(null);
              }}
            >
              Excel (todas las hojas)
            </MenuItem>
            <MenuItem
              onClick={() => {
                exportarCsvTransporte(reporte);
                setMenu(null);
              }}
            >
              Viajes (CSV)
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                window.print();
              }}
            >
              Imprimir
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>
      <Tabs
        value={pestana}
        onChange={(_, v) => setPestana(v)}
        sx={{ mb: 1 }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab label="Por recorrido" />
        <Tab label="Por bus" />
        <Tab label="Por conductor" />
        <Tab label={`Viajes · ${reporte?.viajes.length ?? 0}`} />
      </Tabs>
      {!reporte && !error && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {reporte && (
        <Box sx={{ overflowX: 'auto' }}>
          {pestana === 0 && <TablaGrupo filas={reporte.porLinea} etiqueta="Recorrido" />}
          {pestana === 1 && <TablaGrupo filas={reporte.porBus} etiqueta="Bus" />}
          {pestana === 2 && <TablaGrupo filas={reporte.porConductor} etiqueta="Conductor" />}
          {pestana === 3 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Recorrido</TableCell>
                  <TableCell>Bus</TableCell>
                  <TableCell>Conductor</TableCell>
                  <TableCell align="right">Inicio</TableCell>
                  <TableCell align="right">Fin</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Paradas</TableCell>
                  <TableCell align="right">Desvíos</TableCell>
                  <TableCell align="right">Excesos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reporte.viajes.map((v) => (
                  <TableRow
                    key={v.viajeId}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/transporte/viajes/${v.viajeId}`)}
                  >
                    <TableCell>{String(v.fecha).slice(0, 10)}</TableCell>
                    <TableCell>
                      {v.linea} · {v.variante}
                    </TableCell>
                    <TableCell>{v.vehiculo}</TableCell>
                    <TableCell>{v.conductor ?? '—'}</TableCell>
                    <TableCell align="right">{hora(v.inicioEn)}</TableCell>
                    <TableCell align="right">{hora(v.finEn)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={ESTADO_VIAJE[v.estado]?.color}
                        label={ESTADO_VIAJE[v.estado]?.texto ?? v.estado}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {v.se_detuvo}/{v.paradas}
                      {v.obligatoriasSaltadas ? ` · ${v.obligatoriasSaltadas} saltadas` : ''}
                    </TableCell>
                    <TableCell align="right">{v.desvios}</TableCell>
                    <TableCell align="right">{v.excesos ?? 0}</TableCell>
                  </TableRow>
                ))}
                {reporte.viajes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      Sin viajes terminados en estos días.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Reportes;
