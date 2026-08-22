import { ModuloPendiente } from '@/components/patrones/modulo-pendiente';

export default function Pagina() {
  return (
    <ModuloPendiente
      modulo="EGRESOS"
      etapa={3}
      resumen="Pagos por intangibles y las órdenes de pago que los respaldan."
      incluye={[
        'Registro de egresos con su soporte',
        'Órdenes de pago con consecutivo',
        'Anulación y reemisión, nunca edición',
      ]}
    />
  );
}
