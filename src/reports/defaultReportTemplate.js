export function renderMonthlyReportHTML({
    title,
    programName,
    month,
    executiveSummary,
    kpis,
    questions
}) {
    return `
  <div class="report">
    <h1>${title}</h1>
    <p class="meta">${programName} • ${month}</p>

    <section>
      <h2>Executive Summary</h2>
      <p>${executiveSummary || ""}</p>
    </section>

    ${kpis?.length ? `
      <section>
        <h2>Key Performance Indicators</h2>
        <ul>
          ${kpis.map(k => `<li><strong>${k.label}:</strong> ${k.value}</li>`).join("")}
        </ul>
      </section>
    ` : ""}

    <section>
      <h2>Responses</h2>
      ${questions.map(q => `
        <div class="question-block">
          <h3>${q.question}</h3>
          ${q.context ? `<div class="context"><strong>Context:</strong> ${q.context}</div>` : ""}
          <p>${q.answer}</p>
        </div>
      `).join("")}
    </section>
  </div>
  `;
}
