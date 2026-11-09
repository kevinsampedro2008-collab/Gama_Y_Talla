// @ts-check
/* Comprobación del SERVICIO EXTERNO real de WhatsApp (api.whatsapp.com). NO forma parte de la
 * batería local: playwright.config.js excluye esta carpeta salvo que se pida expresamente.
 *
 * Hace UNA petición GET real a api.whatsapp.com con un número y un texto FICTICIOS (sin datos de
 * clientes) y comprueba que el servicio conserva los emojis y el guion largo hasta el enlace de
 * WhatsApp Web. Ejecutarla solo a propósito:
 *
 *   GT_PRUEBAS_EXTERNAS=1 npx playwright test tests/externo --project=chromium
 *
 * (Movida aquí desde tests/etapa12/whatsapp.spec.js en la etapa 16.2. La construcción y la
 * codificación del enlace se comprueban sin red en esa batería, de forma simulada.)
 */
import { test, expect } from '@playwright/test';

test.describe('En vivo (servicio externo real, ejecución explícita)', () => {
  test('api.whatsapp.com conserva el emoji hasta el enlace de WhatsApp Web', async ({ request }, info) => {
    test.skip(process.env.GT_PRUEBAS_EXTERNAS !== '1', 'Contacta un servicio externo real: solo con GT_PRUEBAS_EXTERNAS=1.');
    test.skip(info.project.name !== 'chromium', 'Comprueba un servicio externo: basta una ejecución.');
    const texto = '*GAMA%20%26%20TALLA%20%E2%80%94%20NUEVO%20PEDIDO*%0A%E2%94%80%E2%94%80%0A%F0%9F%92%B0TOTAL%3A%20%24120.000%0A%F0%9F%9A%9A%20Env%C3%ADo%3A%20Por%20confirmar.';
    const r = await request.get(`https://api.whatsapp.com/send?phone=573000000000&text=${texto}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } });
    expect(r.ok()).toBe(true);
    const html = await r.text();
    const enlace = html.match(/web\.whatsapp\.com\/send[^"' <]*/)?.[0] ?? '';
    expect(enlace, 'emoji 💰 intacto').toContain('%F0%9F%92%B0');
    expect(enlace, 'emoji 🚚 intacto').toContain('%F0%9F%9A%9A');
    expect(enlace, 'guion largo intacto').toContain('%E2%80%94');
    expect(html).not.toContain('%EF%BF%BD');
  });
});
