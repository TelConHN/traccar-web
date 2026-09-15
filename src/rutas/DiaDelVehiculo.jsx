// El día del vehículo, dibujado.
//
// Existe porque un choque de horarios explicado con texto no se entiende: «el vehículo no queda
// libre hasta las 09:31 y esta sale a las 07:30» obliga a leer dos horas, compararlas en la
// cabeza y recién ahí entender el problema. Dibujado se ve en un segundo —dos bloques
// encimados— y es la forma en que cualquiera ya lee un calendario.
//
// Lo que muestra, de atrás hacia adelante:
//   - el horario del conductor, sombreado: fuera de esa franja es tiempo extra.
//   - las rutas que ya tiene ese día, como bloques sólidos.
//   - la que se está armando, con borde punteado porque todavía no existe; en rojo donde
//     choca con otra.
import { makeStyles } from 'tss-react/mui';
import { Typography, Stack } from '@mui/material';

const useStyles = makeStyles()((theme) => ({
  pista: {
    position: 'relative',
    height: 58,
    marginTop: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
    overflow: 'hidden',
  },
  horario: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.palette.action.selected,
    borderLeft: `1px dashed ${theme.palette.text.disabled}`,
    borderRight: `1px dashed ${theme.palette.text.disabled}`,
  },
  bloque: {
    position: 'absolute',
    height: 22,
    borderRadius: 4,
    padding: theme.spacing(0, 0.75),
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: '0.68rem',
    fontWeight: 600,
    boxSizing: 'border-box',
  },
  existente: {
    top: 6,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  nueva: {
    top: 31,
    border: `2px dashed ${theme.palette.success.main}`,
    color: theme.palette.success.main,
    backgroundColor: 'transparent',
  },
  choca: {
    borderColor: theme.palette.error.main,
    color: theme.palette.error.main,
  },
  cruce: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.palette.error.main,
    opacity: 0.22,
  },
  reglas: { display: 'flex', justifyContent: 'space-between', marginTop: 2 },
}));

const minutosDelDia = (d) => d.getHours() * 60 + d.getMinutes();
const deTexto = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const etiquetaHora = (min) => {
  const h = Math.floor(min / 60) % 24;
  const h12 = h % 12 || 12;
  return `${h12} ${h < 12 ? 'am' : 'pm'}`;
};

/**
 * Convierte horas en posiciones. Vive fuera del componente porque trabaja con fechas, y React
 * 19 exige que el render sea puro.
 *
 * La ventana se ajusta a lo que hay que mostrar —con una hora de aire a cada lado— pero nunca
 * es menor que una jornada normal: una pista de 7 a 9 haría que dos horas parecieran el día
 * entero.
 */
export function armarDia({ rutas, nueva, horario }) {
  const tramos = rutas
    .filter((r) => r.salida && r.fin)
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      desde: minutosDelDia(new Date(r.salida)),
      hasta: minutosDelDia(new Date(r.fin)),
    }));
  const nuevo = nueva?.salida
    ? {
        desde: minutosDelDia(nueva.salida),
        hasta: nueva.fin ? minutosDelDia(nueva.fin) : minutosDelDia(nueva.salida) + 30,
      }
    : null;
  const franja =
    horario?.entra && horario?.sale
      ? { desde: deTexto(horario.entra), hasta: deTexto(horario.sale) }
      : null;

  const todos = [...tramos, ...(nuevo ? [nuevo] : []), ...(franja ? [franja] : [])];
  let inicio = Math.min(...todos.map((t) => t.desde), 7 * 60);
  let fin = Math.max(...todos.map((t) => t.hasta), 17 * 60);
  inicio = Math.max(0, Math.floor(inicio / 60) * 60 - 60);
  fin = Math.min(24 * 60, Math.ceil(fin / 60) * 60 + 60);
  const total = fin - inicio;

  const pos = (t) => ({
    left: `${((t.desde - inicio) / total) * 100}%`,
    width: `${Math.max(2, ((t.hasta - t.desde) / total) * 100)}%`,
  });

  // Dónde se pisa la nueva con cada una de las existentes.
  const cruces = nuevo
    ? tramos
        .map((t) => ({
          desde: Math.max(t.desde, nuevo.desde),
          hasta: Math.min(t.hasta, nuevo.hasta),
        }))
        .filter((c) => c.hasta > c.desde)
    : [];

  const marcas = [];
  for (let m = inicio; m <= fin; m += total > 12 * 60 ? 180 : 120) marcas.push(m);

  return {
    tramos: tramos.map((t) => ({ ...t, estilo: pos(t) })),
    nuevo: nuevo ? { ...nuevo, estilo: pos(nuevo) } : null,
    franja: franja ? pos(franja) : null,
    cruces: cruces.map(pos),
    marcas: marcas.map(etiquetaHora),
  };
}

const DiaDelVehiculo = ({ rutas, nueva, horario, titulo }) => {
  const { classes, cx } = useStyles();
  const dia = armarDia({ rutas, nueva, horario });
  const choca = dia.cruces.length > 0;

  return (
    <div>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="subtitle2">{titulo}</Typography>
        {horario?.entra && horario?.sale && (
          <Typography variant="caption" color="text.secondary">
            Horario {horario.entra}–{horario.sale}
          </Typography>
        )}
      </Stack>
      <div className={classes.pista}>
        {dia.franja && <div className={classes.horario} style={dia.franja} />}
        {dia.tramos.map((t) => (
          <div
            key={t.id}
            className={cx(classes.bloque, classes.existente)}
            style={t.estilo}
            title={t.nombre}
          >
            {t.nombre}
          </div>
        ))}
        {dia.cruces.map((c) => (
          // Dos cruces no pueden empezar en el mismo punto: sirve de llave.
          <div key={c.left} className={classes.cruce} style={c} />
        ))}
        {dia.nuevo && (
          <div
            className={cx(classes.bloque, classes.nueva, choca && classes.choca)}
            style={dia.nuevo.estilo}
          >
            Esta ruta
          </div>
        )}
      </div>
      <div className={classes.reglas}>
        {dia.marcas.map((m) => (
          <Typography key={m} variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
            {m}
          </Typography>
        ))}
      </div>
    </div>
  );
};

export default DiaDelVehiculo;
