// src/lib/openaiClient.js
// Frontend-safe wrapper - calls Firebase Function. No OpenAI SDK in browser.

const FUNCTION_URL =
    import.meta.env.VITE_AI_FUNCTION_URL ||
    "https://australia-southeast1-impact-flow-jpc.cloudfunctions.net/ai"; // replace if different

export async function generateText(prompt) {
    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data?.error || `AI request failed (${res.status})`);
    }

    // supports both { text } and { ok, text } response shapes
    return data.text ?? data.output ?? data.result ?? "";
}
