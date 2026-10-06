/**
 * Genera WebP livianos para banners (960/1920) e íconos de categoría (~320).
 * Conserva los PNG/JPG originales.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();

async function webp(srcRel, destRel, { maxW, quality }) {
  const src = path.join(root, srcRel);
  const dest = path.join(root, destRel);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', srcRel);
    return;
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const img = sharp(src, { failOn: 'none' });
  const meta = await img.metadata();
  const w = meta.width || maxW;
  const pipeline = w > maxW ? img.resize({ width: maxW, withoutEnlargement: true }) : img;
  await pipeline.webp({ quality, effort: 4 }).toFile(dest);
  const from = fs.statSync(src).size;
  const to = fs.statSync(dest).size;
  console.log(`${srcRel} ${from} -> ${destRel} ${to}`);
}

const banners = [
  'public/header-banner.png',
  'public/header-banner-2.png',
  'public/header-banner-3.png',
  'public/header-banner-4.png',
  'public/header-banner-moto.png',
  'public/header-banner-moto-2.png',
  'public/header-banner-moto-3.png',
];

const iconos = [
  'public/categoria-filtros.png',
  'public/categoria-frenos.png',
  'public/categoria-embrague.png',
  'public/categoria-aceites-lubricantes.png',
  'public/categoria-autosonido.png',
  'public/categoria-accesorios.png',
  'public/categoria-aire-acondicionado-automotriz.png',
  'public/categoria-carroceria.png',
  'public/categoria-motores-componentes.png',
  'public/categoria-motores-diesel-componentes.png',
  'public/categoria-transmisiones.png',
  'public/categoria-tren-delantero.png',
  'src/assets/categoria-baterias.png',
  'src/assets/categoria-cauchos.png',
  'src/assets/categoria-amortiguadores.png',
  'src/assets/categoria-correas-bandas.png',
  'src/assets/categoria-bujias-encendido.png',
  'src/assets/categoria-luces-faros.png',
  'public/aire acondicionado.jpg',
  'public/carroceria.jpg',
  'public/motores y componentes.jpg',
  'public/motores a diesel y componentes.jpg',
  'public/tren delantero.jpg',
  'public/transmisiones.jpg',
  'public/frenos.png',
  'public/transmision.png',
  'public/Motor.png',
  'public/Cauchos y tripas.png',
  'public/Iluminación.png',
  'public/manubrios y puños.png',
  'public/asiento y carroceria.png',
  'public/maletas.png',
  'public/cascos y ropa.png',
  'public/alarmas.png',
  'public/amortiguadores.jpg',
  'public/bastones.jpg',
  'public/componentes electricos.jpg',
  'public/accesorios moto.jpg',
];

async function main() {
  for (const src of banners) {
    const base = src.replace(/\.[^.]+$/, '');
    await webp(src, `${base}-sm.webp`, { maxW: 960, quality: 72 });
    await webp(src, `${base}.webp`, { maxW: 1920, quality: 76 });
  }
  for (const src of iconos) {
    const dest = src.startsWith('src/assets/')
      ? `public/${path.basename(src).replace(/\.[^.]+$/, '.webp')}`
      : src.replace(/\.[^.]+$/, '.webp');
    await webp(src, dest, { maxW: 320, quality: 72 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
