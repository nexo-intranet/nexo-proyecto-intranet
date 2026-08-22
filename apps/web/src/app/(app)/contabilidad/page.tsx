import { ModuloPendiente } from '@/components/patrones/modulo-pendiente';

export default function Pagina() {
  return (
    <ModuloPendiente
      modulo="CONTABILIDAD"
      etapa={6}
      resumen="Facturación, gastos y el calendario tributario por cliente."
      incluye={[
        'Facturas de venta y su anulación',
        'Gastos y conciliación bancaria',
        'Calendario tributario por último dígito del NIT',
      ]}
    />
  );
}
