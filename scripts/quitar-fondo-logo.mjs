/**
 * Quita el fondo negro del logo y lo reemplaza por transparencia.
 * Solo se afectan píxeles muy oscuros (fondo); el resto del logo se mantiene.
 */
import { Jimp } from 'jimp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pathLogo = join(__dirname, '..', 'public', 'logo.png');

const THRESHOLD = 28; // Píxeles con R,G,B <= este valor se vuelven transparentes (fondo negro)

async function main() {
  const image = await Jimp.read(pathLogo);
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const a = this.bitmap.data[idx + 3];
    if (r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
  await image.write(pathLogo);
  console.log('Logo actualizado: fondo negro reemplazado por transparencia.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
