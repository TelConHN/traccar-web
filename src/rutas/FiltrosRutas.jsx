// Buscar, filtrar y ordenar las rutas de la cuenta.
//
// Tres niveles, de lo que se usa todos los días a lo que se usa a veces:
//   1. la caja de búsqueda y el orden — siempre a la vista;
//   2. el período, el estado y «solo con novedades» — un toque cada uno;
//   3. vehículo, conductor, quién la creó y tipo — detrás de «Más filtros», con el número de
//      los que están puestos para que nunca quede un filtro escondido filtrando sin que se sepa.
//
// Los filtros viven en la dirección de la página, no en la memoria de la pantalla: el botón de
// atrás vuelve a la misma búsqueda y un enlace copiado muestra lo mismo a otra persona.
import { useState } from 'react';
import {
  Stack,
  TextField,
  InputAdornment,
  MenuItem,
  Chip,
  Button,
  FormControlLabel,
  Switch,
  Typography,
  Collapse,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';

export const ORDENES = {
  fecha_desc: 'Más recientes primero',
  fecha_asc: 'Más antiguas primero',
  nombre: 'Por nombre (A–Z)',
  creada_desc: 'Creadas recientemente',
};

const ESTADOS = [
  { valor: 'borrador', texto: 'Sin despachar' },
  { valor: 'despachada', texto: 'En curso' },
  { valor: 'cerrada', texto: 'Cerradas' },
];

// Los períodos de siempre, calculados al momento. Fuera del componente: trabaja con la fecha de
// hoy, y el render tiene que ser puro.
const texto = (d) => d.toLocaleDateString('en-CA');
export const periodos = () => {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return {
    hoy: { texto: 'Hoy', desde: texto(hoy), hasta: texto(hoy) },
    semana: { texto: 'Esta semana', desde: texto(lunes), hasta: texto(domingo) },
    mes: { texto: 'Este mes', desde: texto(primero), hasta: texto(ultimo) },
    todo: { texto: 'Todas las fechas', desde: '', hasta: '' },
  };
};

const FiltrosRutas = ({
  filtros,
  onCambiar,
  busqueda,
  onBuscar,
  vehiculos,
  conductores,
  creadores,
  total,
  truncado,
}) => {
  const [masFiltros, setMasFiltros] = useState(false);
  const rangos = periodos();
  const periodoActivo = Object.entries(rangos).find(
    ([, r]) => r.desde === (filtros.desde ?? '') && r.hasta === (filtros.hasta ?? ''),
  )?.[0];
  const estados = filtros.estado ? filtros.estado.split(',') : [];
  const avanzados = ['traccarDeviceId', 'conductorUserId', 'creadorId', 'tipo'].filter(
    (k) => filtros[k],
  ).length;
  const hayFiltros = Boolean(
    busqueda || filtros.desde || filtros.hasta || estados.length || filtros.novedades || avanzados,
  );

  const alternarEstado = (valor) => {
    const siguiente = estados.includes(valor)
      ? estados.filter((e) => e !== valor)
      : [...estados, valor];
    onCambiar({ estado: siguiente.join(',') });
  };

  return (
    <Stack spacing={1.25} sx={{ p: 2, pb: 1 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <TextField
          size="small"
          placeholder="Buscar por ruta, parada, vehículo, conductor o quién la creó"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          label="Orden"
          value={filtros.orden ?? 'fecha_desc'}
          onChange={(e) =>
            onCambiar({ orden: e.target.value === 'fecha_desc' ? '' : e.target.value })
          }
          sx={{ minWidth: 210 }}
        >
          {Object.entries(ORDENES).map(([valor, nombre]) => (
            <MenuItem key={valor} value={valor}>
              {nombre}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {Object.entries(rangos).map(([clave, r]) => (
          <Chip
            key={clave}
            label={r.texto}
            size="small"
            color={periodoActivo === clave ? 'primary' : 'default'}
            variant={periodoActivo === clave ? 'filled' : 'outlined'}
            onClick={() => onCambiar({ desde: r.desde, hasta: r.hasta })}
          />
        ))}
        <TextField
          size="small"
          type="date"
          label="Desde"
          value={filtros.desde ?? ''}
          onChange={(e) => onCambiar({ desde: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          type="date"
          label="Hasta"
          value={filtros.hasta ?? ''}
          onChange={(e) => onCambiar({ hasta: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 150 }}
        />
      </Stack>

      <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {ESTADOS.map((e) => (
          <Chip
            key={e.valor}
            label={e.texto}
            size="small"
            color={estados.includes(e.valor) ? 'primary' : 'default'}
            variant={estados.includes(e.valor) ? 'filled' : 'outlined'}
            onClick={() => alternarEstado(e.valor)}
          />
        ))}
        <FormControlLabel
          sx={{ ml: 0.5 }}
          control={
            <Switch
              size="small"
              checked={Boolean(filtros.novedades)}
              onChange={(ev) => onCambiar({ novedades: ev.target.checked ? 'true' : '' })}
            />
          }
          label={<Typography variant="body2">Solo las que van mal</Typography>}
        />
        <Button
          size="small"
          startIcon={
            <Badge badgeContent={avanzados} color="primary">
              <TuneIcon fontSize="small" />
            </Badge>
          }
          onClick={() => setMasFiltros((v) => !v)}
        >
          Más filtros
        </Button>
        {hayFiltros && (
          <Button
            size="small"
            onClick={() => {
              onBuscar('');
              onCambiar({
                desde: '',
                hasta: '',
                estado: '',
                novedades: '',
                traccarDeviceId: '',
                conductorUserId: '',
                creadorId: '',
                tipo: '',
                q: '',
              });
            }}
          >
            Quitar filtros
          </Button>
        )}
      </Stack>

      <Collapse in={masFiltros || avanzados > 0}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
          <TextField
            select
            size="small"
            label="Vehículo"
            value={filtros.traccarDeviceId ?? ''}
            onChange={(e) => onCambiar({ traccarDeviceId: e.target.value })}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {vehiculos.map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Conductor"
            value={filtros.conductorUserId ?? ''}
            onChange={(e) => onCambiar({ conductorUserId: e.target.value })}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {conductores.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Creada por"
            value={filtros.creadorId ?? ''}
            onChange={(e) => onCambiar({ creadorId: e.target.value })}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">Cualquiera</MenuItem>
            {creadores.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Tipo"
            value={filtros.tipo ?? ''}
            onChange={(e) => onCambiar({ tipo: e.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="paquetes">Entrega de paquetes</MenuItem>
            <MenuItem value="recorrido">Recorrido</MenuItem>
          </TextField>
        </Stack>
      </Collapse>

      <Typography variant="caption" color="text.secondary">
        {total === 1 ? '1 ruta' : `${total} rutas`}
        {truncado ? ' · se revisaron las primeras 2.000: acotá el período para ver todas' : ''}
      </Typography>
    </Stack>
  );
};

export default FiltrosRutas;
