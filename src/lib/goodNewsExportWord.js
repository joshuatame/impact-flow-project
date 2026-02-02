export function exportGoodNewsTextToWord({ filename = "good-news.doc", text = "" }) {
    // Creates a simple .doc file containing plain text.
    // Word will open it (it’s basically a text file with a .doc extension).
    const blob = new Blob([text], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}
