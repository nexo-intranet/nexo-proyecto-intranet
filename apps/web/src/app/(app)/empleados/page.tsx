import { ModuloPendiente } from '@/components/patrones/modulo-pendiente';

export default function Pagina() {
  return (
    <ModuloPendiente
      modulo="EMPLEADOS"
      etapa={5}
      resumen="Nómina documental, contratos y cartas laborales."
      incluye={[
        'Ficha del empleado y su contrato',
        'Recibos de nómina en PDF',
        'Cartas laborales con consecutivo',
      ]}
    />
  );
}
