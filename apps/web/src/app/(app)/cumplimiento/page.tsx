import { ModuloPendiente } from '@/components/patrones/modulo-pendiente';

export default function Pagina() {
  return (
    <ModuloPendiente
      modulo="CUMPLIMIENTO"
      etapa={7}
      resumen="Verificaciones, políticas versionadas y reportes a la UIAF."
      incluye={[
        'Debida diligencia de clientes',
        'Políticas versionadas con aceptación firmada',
        'Reportes UIAF',
      ]}
    />
  );
}
