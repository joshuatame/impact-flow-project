// src/lib/pdf/loadPdfBytes.js
import { getStorage, ref, getBytes } from "firebase/storage";

// Loads bytes using Storage SDK so the browser never performs a cross-origin fetch
export async function loadPdfBytes({ storagePath, url }) {
    if (storagePath) {
        const storage = getStorage();
        const r = ref(storage, storagePath);
        const bytes = await getBytes(r);
        return bytes;
    }

    // Fallback only. If you rely on URL, you will hit CORS in dev unless you fix CORS rules.
    if (url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
    }

    throw new Error("Missing storagePath and url");
}
