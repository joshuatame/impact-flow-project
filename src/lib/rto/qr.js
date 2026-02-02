import QRCode from "qrcode";

export async function generateQrDataUrlPng(text, opts) {
    const width = opts?.width || 256;
    return QRCode.toDataURL(text, {
        width,
        margin: 1,
        errorCorrectionLevel: "M",
    });
}

export async function generateQrSvg(text, opts) {
    const width = opts?.width || 256;
    return QRCode.toString(text, {
        type: "svg",
        width,
        margin: 1,
        errorCorrectionLevel: "M",
    });
}
