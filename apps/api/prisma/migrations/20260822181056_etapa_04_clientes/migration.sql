-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "codigoDaneMunicipio" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "nombreContacto" TEXT,
ADD COLUMN     "tipoContribuyente" "TipoContribuyente";
