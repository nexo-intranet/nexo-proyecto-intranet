/**
 * Campos opcionales en formularios.
 *
 * Un `<input>` o un `<select>` vacío entrega `""`, nunca `undefined`. Los esquemas
 * de `@nexo/shared` marcan esos campos como `.optional()`, y `""` **no es**
 * undefined: un enum rechaza la cadena vacía, `.email()` la rechaza, y una regex
 * de decimales también. El resultado es un formulario que se niega a enviarse
 * señalando un campo que la persona dejó en blanco a propósito.
 *
 * Se resuelve en el borde, que es donde está el problema: al leer el valor del
 * DOM. El esquema no se toca — que el API siga exigiendo `undefined` y no acepte
 * cadenas vacías como si fueran datos es correcto.
 */
export const opcional = { setValueAs: (valor: unknown) => (valor === '' ? undefined : valor) };
