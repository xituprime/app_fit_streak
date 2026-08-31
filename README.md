# Fit Streak PWA

Aplicación de fitness funcional mobile-first con React, TypeScript, Vite, IndexedDB, cámara y soporte PWA. La detección de push-ups usa MediaPipe Pose Landmarker localmente en el navegador: los fotogramas de la cámara no se guardan ni se suben.

## Ejecutar en Windows

1. Instala [Node.js LTS](https://nodejs.org/).
2. Abre esta carpeta en VS Code y, en la terminal integrada, ejecuta:

   ```powershell
   npm install
   npm run dev -- --host
   ```

3. Abre la URL que muestre Vite. Para probar cámara desde un iPhone, sirve la aplicación mediante HTTPS (por ejemplo, con un túnel HTTPS) y abre dicha URL en Safari. Luego toca **Compartir → Añadir a pantalla de inicio** para instalarla.

## Compilación de producción

```powershell
npm run build
```

Los entrenamientos se guardan solamente en IndexedDB del dispositivo. `src/poseDetector.ts` integra MediaPipe y `src/pushUpCounter.ts` contiene la máquina de estados del ejercicio, lista para añadir otros detectores sin mezclar responsabilidades.

## Probar la detección en iPhone

1. Abre la aplicación desde Safari usando una URL HTTPS; la cámara no funciona desde una IP HTTP.
2. Coloca el iPhone de lado, a unos 2–3 metros, para que se vean hombro, codo, muñeca y cadera de uno de los lados.
3. Autoriza la cámara y realiza una repetición completa: brazos extendidos (**UP**), baja hasta flexionar claramente el codo (**DOWN**) y vuelve a extenderlos (**UP**).
4. Comprueba que solo se cuenta al volver a UP, que aparece el feedback y que al llegar al objetivo se guarda la serie en el historial.
5. Prueba el sonido con el volumen activado: anuncia cada cinco repeticiones y el final de la serie.

La cámara frontal es la predeterminada. Usa el botón **Frontal/Trasera** sobre el preview para cambiarla; el modo frontal se muestra como espejo, sin alterar los landmarks que analiza MediaPipe.

Durante la calibración se muestra un panel **DEBUG** con estado, ángulo de codo suavizado, visibilidad y repeticiones. El contador exige UP estable, DOWN estable y nuevamente UP estable (cuatro frames por extremo); mantener la posición baja no cuenta.
