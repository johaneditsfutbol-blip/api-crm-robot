const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const CONFIG = {
    urlLogin: "https://administrativo.icarosoft.com/",
    urlLista: "https://administrativo.icarosoft.com/Listado_clientes_tickets/",
    user: "JOHANC",  
    pass: "@VNjohanc16",
    selUser: '#id_sc_field_login', 
    selPass: '#id_sc_field_pswd',
};

// Variables Globales
let globalBrowser = null;
let mainPage = null;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 2. MOTOR (VPS SAFE & FAST IMAGES)
// ==========================================
async function iniciarSistema() {
    console.log("🚀 Iniciando Motor V18 (SAFE MODE)...");
    
    globalBrowser = await puppeteer.launch({ 
        headless: "new", 
        defaultViewport: null,
        args: [
            '--no-sandbox',             // OBLIGATORIO VPS
            '--disable-setuid-sandbox', // OBLIGATORIO VPS
            '--disable-dev-shm-usage',  // OBLIGATORIO VPS
            '--window-size=1920,1080',  // Pantalla grande para ver botones
            '--start-maximized'
        ] 
    });

    mainPage = await globalBrowser.newPage();
    mainPage.setDefaultNavigationTimeout(60000); 

    // BLOQUEO SEGURO: Solo imágenes y multimedia. 
    // IMPORTANTE: NO bloqueamos 'stylesheet' para evitar el error de click.
    await mainPage.setRequestInterception(true);
    mainPage.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log("🔑 Iniciando sesión...");
    await mainPage.goto(CONFIG.urlLogin, { waitUntil: 'networkidle2' });

    if (await mainPage.$(CONFIG.selUser)) {
        await mainPage.type(CONFIG.selUser, CONFIG.user);
        await mainPage.type(CONFIG.selPass, CONFIG.pass);
        
        await mainPage.evaluate(() => {
            const spans = document.querySelectorAll('span');
            for (const span of spans) {
                if (span.innerText.includes('Login')) {
                    span.click(); return;
                }
            }
        });
        
        await mainPage.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log("✅ Login Exitoso.");
    } else {
        console.log("ℹ️ Sesión ya activa.");
    }

    setInterval(async () => {
        console.log("💓 Keep-Alive...");
        try { await mainPage.reload({ waitUntil: 'networkidle2' }); } catch(e){}
    }, 600000);
}

// ==========================================
// 3. EXTRACTOR (TU LÓGICA ORIGINAL)
// ==========================================
async function escanearFrames(page, tipoObjetivo) {
    for (const frame of page.frames()) {
        try {
            const data = await frame.evaluate((tipo) => {
                if (tipo === 'perfil') {
                    if (!document.querySelector('[id^="id_sc_field_codigo_producto"]')) return null;
                    
                    const getVal = (id, labelToRemove) => {
                        let el = document.querySelector(`span[id^="${id}"]`);
                        if (!el) return null;
                        let txt = el.innerText;
                        if (labelToRemove) txt = txt.replace(labelToRemove, '');
                        return txt.replace(/[\n\r]+/g, '').trim(); 
                    };

                    return {
                        nombre: getVal('id_sc_field_nombre_cliente', 'Cliente:') || getVal('id_sc_field_id_cliente', 'Cliente:'),
                        plan: getVal('id_sc_field_codigo_producto', 'Plan:'),
                        ip: getVal('id_sc_field_ip_servicio', 'Ip Servicio:'),
                        estado: getVal('id_sc_field_estado'),
                        saldo: getVal('id_sc_field_saldo'),
                        direccion: document.querySelector('a[id="bdireccion_servicio"]')?.getAttribute('title') || "No detectada"
                    };
                }
            }, tipoObjetivo);

            if (data) return data; 
        } catch(e) {}
    }
    return null;
}

async function esperarYExtraer(page, tipo, intentosMax = 5) {
    console.log(`      ⏳ Esperando datos de '${tipo}'...`);
    for (let i = 0; i < intentosMax; i++) {
        const data = await escanearFrames(page, tipo);
        if (data) {
            console.log("      ✅ Datos capturados.");
            return data;
        }
        await esperar(1000); // 1 segundo entre intentos (balanceado)
    }
    console.log("      ⚠️ Tiempo agotado.");
    return null;
}

// ==========================================
// 4. FLUJO DE BÚSQUEDA
// ==========================================
async function buscarCliente(idBusqueda) {
    if (!globalBrowser) throw new Error("Sistema iniciando...");
    console.log(`🤖 Procesando: ${idBusqueda}`);
    const page = await globalBrowser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // Bloqueo de imágenes en la nueva pestaña también
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    try {
        await page.goto(CONFIG.urlLista, { waitUntil: 'networkidle2' });

        const searchIn = '#SC_fast_search_top'; 
        const searchBtn = '#SC_fast_search_submit_top';
        
        if (await page.$(searchIn)) {
            await page.type(searchIn, idBusqueda);
            await page.click(searchBtn);
            await esperar(3000); // Tiempo seguro para que cargue la lista
        }

        const iconEdit = '.fa-user-edit';
        try { await page.waitForSelector(iconEdit, { timeout: 15000 }); } 
        catch(e) { throw new Error("Cliente no encontrado."); }

        const newTargetPromise = globalBrowser.waitForTarget(target => target.opener() === page.target());
        await page.click(iconEdit);
        const tab = await (await newTargetPromise).page();
        
        // Bloqueo en la pestaña final
        await tab.setRequestInterception(true);
        tab.on('request', (req) => {
            if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await tab.bringToFront();
        await esperar(3000); // Tiempo seguro para carga visual

        // PERFIL
        console.log("   ⬇️ Perfil...");
        try { await tab.click('#cel2 a'); await esperar(1000); } catch(e){}
        
        let perfil = await esperarYExtraer(tab, 'perfil', 10);

        await tab.close();
        await page.close();

        return {
            id: idBusqueda,
            perfil: perfil || {},
            facturas: [], 
            transacciones: []
        };

    } catch (error) {
        if(page && !page.isClosed()) await page.close();
        throw error;
    }
}

// ==========================================
// 5. SERVIDOR
// ==========================================
app.get('/buscar', async (req, res) => {
    try {
        const datos = await buscarCliente(req.query.id);
        res.json({ success: true, data: datos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`\n🚀 SERVIDOR V18 (SAFE MODE) LISTO: http://localhost:${PORT}`);
    await iniciarSistema();
});
