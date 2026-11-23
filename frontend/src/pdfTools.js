// Small helpers to save a PDF or open the print window for it.

export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function printBlob(blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.src = url;
  frame.onload = function () {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      window.open(url, "_blank");
    }
  };
  document.body.appendChild(frame);
  setTimeout(function () {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120000);
}
