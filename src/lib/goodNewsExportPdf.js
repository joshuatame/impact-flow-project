// src/lib/goodNewsExportPdf.js
export function exportGoodNewsToPdf({ title, participantName, createdDate, storyHtml, photoUrls = [] }) {
    // No external deps required. Uses browser Print to PDF.
    // User chooses "Save as PDF" in print dialog.
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
        alert("Popup blocked. Please allow popups to export PDF.");
        return;
    }

    const safeTitle = title || "Good News Story";
    const safeParticipant = participantName || "";
    const safeDate = createdDate || "";

    const imagesHtml = (photoUrls || [])
        .map(
            (url) => `
      <div class="imgWrap">
        <img src="${url}" />
      </div>
    `
        )
        .join("");

    w.document.open();
    w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(safeTitle)}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px 0; font-size: 22px; }
          .meta { font-size: 12px; color: #475569; margin-bottom: 18px; }
          .meta span { display: inline-block; margin-right: 14px; }
          .story { font-size: 14px; line-height: 1.6; }
          .images { margin-top: 18px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .imgWrap { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
          img { width: 100%; height: auto; display: block; }
          @media print {
            body { padding: 0; }
            .images { grid-template-columns: repeat(2, 1fr); }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(safeTitle)}</h1>
        <div class="meta">
          ${safeParticipant ? `<span><strong>Participant:</strong> ${escapeHtml(safeParticipant)}</span>` : ""}
          ${safeDate ? `<span><strong>Date:</strong> ${escapeHtml(safeDate)}</span>` : ""}
        </div>

        <div class="story">${storyHtml || ""}</div>

        ${photoUrls?.length ? `<div class="images">${imagesHtml}</div>` : ""}

        <script>
          // Wait a moment for images to load, then print
          setTimeout(() => {
            window.focus();
            window.print();
          }, 600);
        </script>
      </body>
    </html>
  `);
    w.document.close();
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
