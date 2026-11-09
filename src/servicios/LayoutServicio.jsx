// El marco común de Rutas y Transporte.
//
// En la computadora, un menú más angosto que el de ajustes: son pocas secciones de nombre corto y
// las tablas necesitan ese ancho. En el teléfono, las secciones van a la vista en una fila que se
// queda arriba al bajar: antes había que abrir el menú para saber siquiera en cuál se estaba.
import { useEffect, useRef } from 'react';
import { Box, ButtonBase, useMediaQuery } from '@mui/material';
import { Link } from 'react-router-dom';
import PageLayout from '../common/components/PageLayout';
import TemaServicio from './TemaServicio';

const ANCHO_MENU = '260px';

const SeccionesMovil = ({ secciones }) => {
  const telefono = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const filaRef = useRef(null);
  const elegidaRef = useRef(null);

  // La sección abierta a la vista al entrar a ella, aunque esté al final de la fila. Solo al cambiar
  // de sección: sin eso, la fila volvía sola a su lugar mientras alguien la estaba deslizando.
  const abierta = secciones.find((s) => s.elegida)?.ruta;
  useEffect(() => {
    if (filaRef.current && elegidaRef.current) {
      const f = filaRef.current;
      const e = elegidaRef.current;
      f.scrollLeft = e.offsetLeft - (f.clientWidth - e.offsetWidth) / 2;
    }
  }, [abierta, telefono]);

  if (!telefono || secciones.length < 2) return null;

  return (
    <Box
      component="nav"
      aria-label="Secciones"
      data-tour="secciones-movil"
      ref={filaRef}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        flexShrink: 0,
        display: 'flex',
        gap: 1,
        px: 2,
        py: 1,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        bgcolor: 'background.default',
        borderBottom: 1,
        borderColor: 'divider',
        // Con el teléfono acostado no hay altura para llevarla pegada arriba.
        '@media (max-height: 500px)': { position: 'static' },
        '@media print': { display: 'none' },
      }}
    >
      {secciones.map((s) => (
        <ButtonBase
          key={s.ruta}
          component={Link}
          to={s.ruta}
          ref={s.elegida ? elegidaRef : null}
          aria-current={s.elegida ? 'page' : undefined}
          sx={{
            flexShrink: 0,
            gap: 0.75,
            height: 40,
            px: 1.5,
            borderRadius: 5,
            typography: 'body2',
            whiteSpace: 'nowrap',
            fontWeight: s.elegida ? 600 : 400,
            color: s.elegida ? 'primary.contrastText' : 'text.primary',
            bgcolor: s.elegida ? 'primary.main' : 'action.hover',
            '& svg': { fontSize: 18 },
          }}
        >
          {s.icono}
          {s.titulo}
          {s.pendientes > 0 && ` · ${s.pendientes}`}
        </ButtonBase>
      ))}
    </Box>
  );
};

const LayoutServicio = ({ secciones, breadcrumbs, children, ...resto }) => (
  <TemaServicio>
    <PageLayout
      anchoMenu={ANCHO_MENU}
      breadcrumbs={breadcrumbs}
      // La sección ya se lee en la fila de abajo: con las dos, «Transporte / Compartir seguimiento»
      // no cabía y partía el encabezado en dos renglones.
      breadcrumbsMovil={breadcrumbs.slice(0, 1)}
      {...resto}
    >
      <SeccionesMovil secciones={secciones} />
      {children}
    </PageLayout>
  </TemaServicio>
);

export default LayoutServicio;
