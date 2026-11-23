// Prepares a picture or a PDF so the AI assistant can read it.
// Pictures are made smaller first, so the upload is fast.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIDE = 1600;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This picture could not be opened."));
    img.src = url;
  });
}

export async function prepareAttachment(file) {
  if (!file) throw new Error("No file was chosen.");
  const type = (file.type || "").toLowerCase();

  if (type === "application/pdf") {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("This PDF is bigger than 5 MB. Please use a smaller PDF or attach a picture of the page.");
    }
    const url = await readAsDataUrl(file);
    return { name: file.name, mime: "application/pdf", data: url.split(",")[1], preview: "" };
  }

  if (IMAGE_TYPES.includes(type)) {
    const img = await loadImage(await readAsDataUrl(file));
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    const data = out.split(",")[1];
    if (data.length * 0.75 > MAX_FILE_BYTES) {
      throw new Error("This picture is too big even after making it smaller. Please try a smaller one.");
    }
    return { name: file.name, mime: "image/jpeg", data: data, preview: out };
  }

  throw new Error("Please attach a picture (JPG, PNG or WebP) or a PDF.");
}
