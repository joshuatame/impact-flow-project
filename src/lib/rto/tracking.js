export function parseAttributionFromUrl(url) {
    const u = new URL(url);
    const code = u.pathname.startsWith("/r/") ? u.pathname.split("/r/")[1] : (u.searchParams.get("code") || "");
    return {
        code: code || null,
        intakeId: u.searchParams.get("intakeId") || null,
        campaignId: u.searchParams.get("campaignId") || null,
        campaignLinkId: u.searchParams.get("campaignLinkId") || null,
        sourceChannel: u.searchParams.get("sourceChannel") || null,
        bdUserId: u.searchParams.get("bdUserId") || null,
        qrVariant: u.searchParams.get("qrVariant") || null,

        utm: {
            utm_source: u.searchParams.get("utm_source") || "",
            utm_medium: u.searchParams.get("utm_medium") || "",
            utm_campaign: u.searchParams.get("utm_campaign") || "",
            utm_content: u.searchParams.get("utm_content") || "",
            utm_term: u.searchParams.get("utm_term") || "",
        },

        client: {
            referrer: document.referrer || "",
            userAgent: navigator.userAgent || "",
            ts: Date.now(),
        },
    };
}
