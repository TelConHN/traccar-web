// Velocidad por tramo (fase 7) y cambios propuestos a la línea (fase 8), dentro del detalle de
// un recorrido.
//
// Un tramo se marca tocando inicio y fin sobre la línea (el modo lo maneja LineaDetalle) o
// escribiendo los km. Se guardan todos juntos: así nunca quedan dos tramos pisados a medio
// guardar. Al guardar, el servidor pide al panel que los buses de esta línea pasen a reportar
// cada 15 s (nivel Preciso): sin eso la velocidad no se puede evaluar.
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import transporteApi from './api';
import { prepararLinea, recortar, colorDeLimite } from './geo';

const LIMITES = [30, 40, 50, 60, 70, 80, 90, 100];

const TramosLinea = ({
  linea,
  variante,
  puedeEditar,
  tramoNuevo,
  onTramoUsado,
  onCapas,
  onCambioLinea,
  conLimitador = false,
}) => {
  const [tramos, setTramos] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [sucio, setSucio] = useState(false);

  const cargar = async () => {
    try {
      const [t, p] = await Promise.all([
        transporteApi.tramos(linea.id, variante.id),
        puedeEditar ? transporteApi.propuestas(linea.id, variante.id).catch(() => []) : [],
      ]);
      setTramos(t);
      setPropuestas(p);
      setSucio(false);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
  }, [linea.id, variante.id, variante.geometria]);

  // Un tramo marcado en el mapa (inicio y fin) llega desde LineaDetalle.
  useEffect(() => {
    if (!tramoNuevo) return;
    setTramos((ts) => [...ts, { ...tramoNuevo, limiteKmh: 60 }]);
    setSucio(true);
    onTramoUsado?.();
  }, [tramoNuevo]);

  // Lo que se dibuja: cada tramo de su color, y cada propuesta con la calle que usan los buses.
  useEffect(() => {
    const prep = variante.geometria?.length > 1 ? prepararLinea(variante.geometria) : null;
    const capas = [];
    tramos.forEach((t) => {
      if (t.desdeMetro != null && prep) {
        capas.push({
          clave: `t-${t.desdeMetro}`,
          coordenadas: recortar(prep, t.desdeMetro, t.hastaMetro),
          color: colorDeLimite(t.limiteKmh),
        });
      }
    });
    propuestas.forEach((p, i) => {
      capas.push({ clave: `p-${i}`, coordenadas: p.trazo, color: '#16a34a' });
    });
    onCapas?.(capas);
  }, [tramos, propuestas, variante.geometria]);

  const guardar = async () => {
    setError('');
    try {
      const cuerpo = tramos.map((t) =>
        t.desdeMetro != null
          ? {
              desdeMetro: Math.round(t.desdeMetro),
              hastaMetro: Math.round(t.hastaMetro),
              limiteKmh: t.limiteKmh,
              nombre: t.nombre ?? null,
            }
          : { desde: t.desde, hasta: t.hasta, limiteKmh: t.limiteKmh, nombre: t.nombre ?? null },
      );
      setTramos(await transporteApi.guardarTramos(linea.id, variante.id, cuerpo));
      setSucio(false);
      setAviso('Tramos guardados. Los buses de esta línea van a pasar a reportar cada 15 s.');
    } catch (e) {
      setError(e.message);
    }
  };

  const aplicar = async (p) => {
    setError('');
    try {
      await transporteApi.aplicarPropuesta(linea.id, variante.id, {
        desdeMetro: p.desdeMetro,
        hastaMetro: p.hastaMetro,
        trazo: p.trazo,
      });
      setAviso('La línea quedó actualizada con la calle que usan los buses.');
      onCambioLinea?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const km = (m) => (m == null ? '' : (m / 1000).toFixed(2));

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Límites de velocidad</Typography>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {aviso && (
        <Alert severity="success" onClose={() => setAviso('')}>
          {aviso}
        </Alert>
      )}
      {puedeEditar && (
        <TextField
          select
          size="small"
          label="Límite general de la línea"
          value={linea.limiteGeneralKmh ?? ''}
          onChange={async (e) => {
            const valor = e.target.value === '' ? null : Number(e.target.value);
            try {
              await transporteApi.editarLinea(linea.id, { limiteGeneralKmh: valor });
              onCambioLinea?.();
            } catch (err) {
              setError(err.message);
            }
          }}
          helperText="Rige donde no hay un tramo marcado. Sin límite general, solo se evalúan los tramos."
        >
          <MenuItem value="">Sin límite general</MenuItem>
          {LIMITES.map((l) => (
            <MenuItem key={l} value={l}>
              {l} km/h
            </MenuItem>
          ))}
        </TextField>
      )}
      {/* Entre parada y parada: es como lo piensa quien arma el recorrido —«del colegio al
          semáforo, 40»— y no hay que acertarle a dos puntos sobre la línea. El servidor lo
          convierte a metros con las paradas. */}
      {puedeEditar && variante.paradas?.length > 1 && (
        <Stack spacing={1}>
          <Typography variant="body2" fontWeight={600}>
            Entre paradas
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {conLimitador
              ? 'Estos límites avisan cuando el bus se pasa. El limitador que lleva el vehículo es un solo número para todo el recorrido: se carga en Ajustes → Límite de velocidad.'
              : 'Estos límites avisan cuando el bus se pasa. Para que además el vehículo no pueda pasar de esa velocidad hace falta el limitador, que es un aparato que se instala: escribinos y te lo cotizamos.'}
          </Typography>
          {variante.paradas.slice(0, -1).map((p, i) => {
            const siguiente = variante.paradas[i + 1];
            const puesto = tramos.find(
              (t) => t.desdeParada === p.orden && t.hastaParada === siguiente.orden,
            );
            return (
              <Stack key={p.id ?? p.orden} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                  {p.nombre} → {siguiente.nombre}
                </Typography>
                <TextField
                  select
                  size="small"
                  sx={{ width: 120 }}
                  value={puesto?.limiteKmh ?? ''}
                  onChange={(e) => {
                    const valor = e.target.value === '' ? null : Number(e.target.value);
                    setTramos((ts) => {
                      const otros = ts.filter(
                        (t) => !(t.desdeParada === p.orden && t.hastaParada === siguiente.orden),
                      );
                      return valor == null
                        ? otros
                        : [
                            ...otros,
                            {
                              desdeParada: p.orden,
                              hastaParada: siguiente.orden,
                              limiteKmh: valor,
                            },
                          ];
                    });
                    setSucio(true);
                  }}
                >
                  <MenuItem value="">Sin límite</MenuItem>
                  {LIMITES.map((l) => (
                    <MenuItem key={l} value={l}>
                      {l} km/h
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            );
          })}
        </Stack>
      )}

      {tramos.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Sin tramos.{' '}
          {puedeEditar && 'Elegí «Marcar tramo» y tocá el inicio y el fin sobre la línea.'}
        </Typography>
      )}
      {tramos.map((t, i) => (
        <Stack key={`${t.desdeMetro ?? i}-${i}`} direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            sx={{ bgcolor: colorDeLimite(t.limiteKmh), color: '#fff', minWidth: 58 }}
            label={`${t.limiteKmh}`}
          />
          {t.desdeParada != null ? (
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              Entre la parada {t.desdeParada} y la {t.hastaParada}
            </Typography>
          ) : t.desdeMetro != null ? (
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              km {km(t.desdeMetro)} → {km(t.hastaMetro)}
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ flexGrow: 1 }} color="text.secondary">
              Marcado en el mapa (se ubica al guardar)
            </Typography>
          )}
          {puedeEditar && (
            <>
              <TextField
                select
                size="small"
                value={t.limiteKmh}
                onChange={(e) => {
                  setTramos((ts) =>
                    ts.map((x, j) => (j === i ? { ...x, limiteKmh: Number(e.target.value) } : x)),
                  );
                  setSucio(true);
                }}
                sx={{ width: 90 }}
              >
                {LIMITES.map((l) => (
                  <MenuItem key={l} value={l}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton
                size="small"
                onClick={() => {
                  setTramos((ts) => ts.filter((_, j) => j !== i));
                  setSucio(true);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Stack>
      ))}
      {puedeEditar && sucio && (
        <Button variant="contained" size="small" onClick={guardar}>
          Guardar tramos
        </Button>
      )}

      {puedeEditar && propuestas.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ pt: 1 }}>
            Cambios propuestos
          </Typography>
          {propuestas.map((p) => (
            <Alert
              key={`${p.desdeMetro}-${p.hastaMetro}`}
              severity="info"
              action={
                <Button size="small" onClick={() => aplicar(p)}>
                  Actualizar la línea
                </Button>
              }
            >
              {p.viajes} de {p.totalViajes} viajes de la semana van por otra calle entre el km{' '}
              {km(p.desdeMetro)} y el {km(p.hastaMetro)}. En verde, la calle que usan.
            </Alert>
          ))}
        </>
      )}
    </Stack>
  );
};

export default TramosLinea;
