import fs from "fs";
import path from "path";
import { GarantiaInfo, GarantiaEstado } from "./types";

const CACHE_DIR = path.resolve(process.cwd(), "..", "data", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "warranties.json");

interface WarrantyCacheData {
  [serial: string]: GarantiaInfo;
}

let memoryCache: WarrantyCacheData | null = null;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache(): WarrantyCacheData {
  if (memoryCache !== null) return memoryCache;
  ensureCacheDir();
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      memoryCache = JSON.parse(raw);
      return memoryCache || {};
    } catch {
      memoryCache = {};
      return memoryCache;
    }
  }
  memoryCache = {};
  return memoryCache;
}

function saveCache(data: WarrantyCacheData) {
  memoryCache = data;
  try {
    ensureCacheDir();
    const tmp = `${CACHE_FILE}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, CACHE_FILE);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EPERM" || error.code === "EBUSY") {
      try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
      } catch {
        // Ignorar si hay lock transitorio
      }
    }
  }
}

/**
 * Detecta automáticamente la marca a partir del serial o descripción del modelo
 */
export function detectManufacturer(
  serial: string,
  modelo?: string
): "LENOVO" | "DELL" | "APPLE" | "OTRO" {
  const modUpper = (modelo || "").toUpperCase();
  const serUpper = (serial || "").toUpperCase();

  if (
    modUpper.includes("THINKPAD") ||
    modUpper.includes("LENOVO") ||
    serUpper.startsWith("PF") ||
    serUpper.startsWith("PC") ||
    serUpper.startsWith("MP") ||
    serUpper.startsWith("1S")
  ) {
    return "LENOVO";
  }

  if (
    modUpper.includes("DELL") ||
    modUpper.includes("LATITUDE") ||
    modUpper.includes("VOSTRO") ||
    modUpper.includes("PRECISION") ||
    /^[A-Z0-9]{7}$/.test(serUpper) && (modUpper.includes("5420") || modUpper.includes("5430"))
  ) {
    return "DELL";
  }

  if (
    modUpper.includes("MACBOOK") ||
    modUpper.includes("APPLE") ||
    modUpper.includes("A2337") ||
    modUpper.includes("A2338") ||
    modUpper.includes("A2442") ||
    modUpper.includes("A2485")
  ) {
    return "APPLE";
  }

  return "OTRO";
}

/**
 * Consulta la garantía de Lenovo a través del portal pcsupport
 */
export async function queryLenovoWarranty(serial: string): Promise<GarantiaInfo> {
  const cleanSerial = serial.trim().toUpperCase();
  const timestamp = new Date().toISOString();

  try {
    // Paso 1: Resolver Serial a ID Interno de Producto
    const productUrl = `https://pcsupport.lenovo.com/us/en/api/v4/mse/getproducts?productId=${encodeURIComponent(
      cleanSerial
    )}`;
    const prodRes = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!prodRes.ok) {
      throw new Error(`Lenovo getproducts HTTP ${prodRes.status}`);
    }

    const prodData = await prodRes.json();
    if (!Array.isArray(prodData) || prodData.length === 0 || !prodData[0]?.Id) {
      return {
        vigente: false,
        estado: "DESCONOCIDO",
        fechaFin: null,
        proveedor: "LENOVO",
        consultadoEn: timestamp,
        error: "Número de serie no localizado en base de datos Lenovo",
      };
    }

    const deviceId = prodData[0].Id;
    const productName = prodData[0].Name || "Lenovo ThinkPad";

    // Paso 2: Extraer datos de garantía desde la página de producto
    const warrantyUrl = `https://pcsupport.lenovo.com/us/en/products/${deviceId}/warranty`;
    const wRes = await fetch(warrantyUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!wRes.ok) {
      throw new Error(`Lenovo warranty page HTTP ${wRes.status}`);
    }

    const html = await wRes.text();
    const idx = html.indexOf("var ds_warranties = window.ds_warranties ||");
    if (idx === -1) {
      return {
        vigente: false,
        estado: "DESCONOCIDO",
        fechaFin: null,
        proveedor: "LENOVO",
        productoNombre: productName,
        consultadoEn: timestamp,
        error: "No se encontró bloque de garantía ds_warranties en Lenovo",
      };
    }

    // Extraer bloque JSON balanceado
    const start = html.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    const jsonStr = html.slice(start, end);
    const parsed = JSON.parse(jsonStr);

    const isVigente = Boolean(parsed.Status);
    const warrantiesList = parsed.BaseUpmaWarranties || parsed.BaseWarranties || [];
    
    // Obtener la fecha de fin más tardía si hay múltiples garantías
    let latestEndDate: string | null = null;
    let serviceType = parsed.IsPremier ? "Premier Support" : "Depot / Standard";

    for (const w of warrantiesList) {
      if (w?.End) {
        const dStr = String(w.End).slice(0, 10);
        if (!latestEndDate || dStr > latestEndDate) {
          latestEndDate = dStr;
        }
      }
    }

    // Calcular días restantes
    let diasRestantes: number | undefined;
    let estado: GarantiaEstado = isVigente ? "VIGENTE" : "EXPIRADA";

    if (latestEndDate) {
      const today = new Date();
      const endD = new Date(latestEndDate);
      const diffMs = endD.getTime() - today.getTime();
      diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diasRestantes > 0) {
        estado = diasRestantes <= 30 ? "POR_VENCER" : "VIGENTE";
      } else {
        estado = "EXPIRADA";
      }
    }

    return {
      vigente: isVigente || (diasRestantes !== undefined && diasRestantes > 0),
      estado,
      fechaFin: latestEndDate,
      diasRestantes,
      tipoServicio: serviceType,
      proveedor: "LENOVO",
      productoNombre: parsed.ProductName || productName,
      consultadoEn: timestamp,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      vigente: false,
      estado: "ERROR",
      fechaFin: null,
      proveedor: "LENOVO",
      consultadoEn: timestamp,
      error: `Error al consultar Lenovo: ${message}`,
    };
  }
}

/**
 * Consulta la garantía de Dell
 */
export async function queryDellWarranty(serial: string): Promise<GarantiaInfo> {
  const cleanSerial = serial.trim().toUpperCase();
  const timestamp = new Date().toISOString();
  const clientId = process.env.DELL_CLIENT_ID;
  const clientSecret = process.env.DELL_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      // 1. Obtener Token OAuth2 de Dell
      const authRes = await fetch("https://apigtwb2c.us.dell.com/auth/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!authRes.ok) throw new Error(`Dell OAuth HTTP ${authRes.status}`);
      const authData = await authRes.json();
      const token = authData.access_token;

      // 2. Consultar Entitlements
      const wRes = await fetch(
        `https://apigtwb2c.us.dell.com/PROD/sbil/eapi/v5/asset-entitlements?servicetags=${encodeURIComponent(
          cleanSerial
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!wRes.ok) throw new Error(`Dell Entitlements HTTP ${wRes.status}`);
      const wData = await wRes.json();
      const asset = Array.isArray(wData) ? wData[0] : wData;

      if (!asset) {
        return {
          vigente: false,
          estado: "DESCONOCIDO",
          fechaFin: null,
          proveedor: "DELL",
          consultadoEn: timestamp,
          error: "Service Tag no encontrado en Dell",
        };
      }

      let latestEndDate: string | null = null;
      let isVigente = false;
      const entitlements = asset.entitlements || [];

      for (const ent of entitlements) {
        if (ent.endDate) {
          const dStr = String(ent.endDate).slice(0, 10);
          if (!latestEndDate || dStr > latestEndDate) latestEndDate = dStr;
        }
        if (ent.serviceLevelCode || ent.serviceLevelDescription) {
          isVigente = isVigente || ent.entitlementType === "Active";
        }
      }

      let diasRestantes: number | undefined;
      let estado: GarantiaEstado = "EXPIRADA";
      if (latestEndDate) {
        const today = new Date();
        const endD = new Date(latestEndDate);
        const diffMs = endD.getTime() - today.getTime();
        diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diasRestantes > 0) {
          estado = diasRestantes <= 30 ? "POR_VENCER" : "VIGENTE";
          isVigente = true;
        }
      }

      return {
        vigente: isVigente,
        estado,
        fechaFin: latestEndDate,
        diasRestantes,
        tipoServicio: entitlements[0]?.serviceLevelDescription || "Dell ProSupport",
        proveedor: "DELL",
        productoNombre: asset.model || `Dell Service Tag ${cleanSerial}`,
        consultadoEn: timestamp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        vigente: false,
        estado: "ERROR",
        fechaFin: null,
        proveedor: "DELL",
        consultadoEn: timestamp,
        error: msg,
      };
    }
  }

  // Fallback si no hay credenciales de Dell API configuradas:
  return {
    vigente: false,
    estado: "DESCONOCIDO",
    fechaFin: null,
    proveedor: "DELL",
    consultadoEn: timestamp,
    error: "Credenciales de Dell TechDirect pendientes de configurar en .env (DELL_CLIENT_ID)",
  };
}

/**
 * Consulta la garantía de Apple
 */
export async function queryAppleWarranty(serial: string): Promise<GarantiaInfo> {
  const timestamp = new Date().toISOString();
  return {
    vigente: false,
    estado: "DESCONOCIDO",
    fechaFin: null,
    proveedor: "APPLE",
    productoNombre: "Apple Mac Device",
    consultadoEn: timestamp,
    error: "Consulta automática de Apple requiere GSX Partner API",
  };
}

/**
 * Función principal para consultar garantía individual (con caché automático)
 */
export async function lookupWarranty(
  serial: string,
  modelo?: string,
  forceRefresh = false
): Promise<GarantiaInfo> {
  const cleanSerial = (serial || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!cleanSerial) {
    return {
      vigente: false,
      estado: "DESCONOCIDO",
      fechaFin: null,
      proveedor: "OTRO",
      consultadoEn: new Date().toISOString(),
      error: "Serial vacío",
    };
  }

  const cache = loadCache();
  if (!forceRefresh && cache[cleanSerial]) {
    return cache[cleanSerial];
  }

  const manufacturer = detectManufacturer(cleanSerial, modelo);
  let result: GarantiaInfo;

  if (manufacturer === "LENOVO") {
    result = await queryLenovoWarranty(cleanSerial);
  } else if (manufacturer === "DELL") {
    result = await queryDellWarranty(cleanSerial);
  } else if (manufacturer === "APPLE") {
    result = await queryAppleWarranty(cleanSerial);
  } else {
    result = {
      vigente: false,
      estado: "DESCONOCIDO",
      fechaFin: null,
      proveedor: "OTRO",
      consultadoEn: new Date().toISOString(),
      error: "Fabricante no soportado para consulta directa",
    };
  }

  // Guardar en caché local
  cache[cleanSerial] = result;
  saveCache(cache);

  return result;
}

/**
 * Obtiene todas las garantías que ya existen en el caché local
 */
export function getAllCachedWarranties(): WarrantyCacheData {
  return loadCache();
}

/**
 * Consulta masiva por lotes controlando la concurrencia
 */
export async function batchLookupWarranties(
  items: { serial: string; modelo?: string }[],
  concurrency = 3
): Promise<WarrantyCacheData> {
  const cache = loadCache();
  const missing = items.filter((it) => {
    const s = it.serial.trim().toUpperCase().replace(/\s+/g, "");
    return s && !cache[s];
  });

  for (let i = 0; i < missing.length; i += concurrency) {
    const chunk = missing.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          await lookupWarranty(item.serial, item.modelo);
        } catch {
          // Ignorar fallos puntuales
        }
      })
    );
    // Pequeño retardo entre bloques para cortesía de red
    if (i + concurrency < missing.length) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return loadCache();
}

