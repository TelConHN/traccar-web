import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

// Recordatorio de pago al entrar a la app. Lo decide el panel (admin/api/src/services/
// avisoCobroApp.js): sale solo a la cuenta principal de un cliente en mora sin respuesta, y solo
// si alguien lo activó desde Cobranza.
//
// El texto es cordial a propósito. Lo único firme es que no se cierra tocando afuera y que
// «Entendido» se habilita tras una espera que el panel alarga cada vez que se cierra.
// «Escribirnos» no espera: es justo lo que se busca que haga.

const WHATSAPP = '50493160446';

const fmtFecha = (s) => {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
};

const AvisoCobroDialog = () => {
  const [aviso, setAviso] = useState(null);
  const [restante, setRestante] = useState(0);

  useEffect(() => {
    let vigente = true;
    fetch('/api/rutas/cobro/aviso')
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => {
        if (vigente && a?.mostrar) {
          setAviso(a);
          setRestante(a.espera);
        }
      })
      // Si el panel no responde, la app sigue igual: el aviso no puede impedir entrar.
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!aviso || restante <= 0) return undefined;
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [aviso, restante]);

  if (!aviso) return null;

  const entendido = () => {
    fetch('/api/rutas/cobro/aviso/visto', { method: 'POST' }).catch(() => {});
    setAviso(null);
  };

  const textoWhatsapp = encodeURIComponent(
    `Hola, les escribo por mi saldo pendiente de ${aviso.monto} desde el ${fmtFecha(aviso.desde)}.`,
  );

  return (
    <Dialog open disableEscapeKeyDown onClose={() => {}} maxWidth="xs" fullWidth>
      <DialogTitle>Un recordatorio amable</DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          Estimado cliente, esperamos que esté muy bien. Le recordamos que tiene un saldo pendiente
          de <strong>{aviso.monto}</strong> desde el {fmtFecha(aviso.desde)}.
          {aviso.proximo && (
            <>
              {' '}
              Además, el {fmtFecha(aviso.proximo.fecha)} vence su próximo pago de{' '}
              {aviso.proximo.monto}; el total a esa fecha sería{' '}
              <strong>{aviso.proximo.total}</strong>.
            </>
          )}
        </Typography>
        <Typography gutterBottom>
          {aviso.limitePasado
            ? 'Le agradeceríamos realizar su pago cuando le sea posible, así su servicio sigue funcionando con normalidad.'
            : `Le agradeceríamos realizar su pago antes del ${fmtFecha(aviso.limite)}, así su servicio sigue funcionando con normalidad.`}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Si ya realizó su pago, muchas gracias y disculpe la molestia. Si necesita más tiempo o
          tiene alguna consulta, con gusto le atendemos por WhatsApp.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          href={`https://wa.me/${WHATSAPP}?text=${textoWhatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: '#1b8f4c' }}
        >
          Escribirnos
        </Button>
        <Button variant="contained" disabled={restante > 0} onClick={entendido}>
          {restante > 0 ? `Entendido (${restante})` : 'Entendido'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AvisoCobroDialog;
