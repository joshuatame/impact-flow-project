// src/lib/firebaseUploadPhotos.js
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "@/firebase";

// Uploads images to Firebase Storage using the SDK (avoids the Base44 UploadFile error).
// Returns array of download URLs.
export async function uploadGoodNewsPhotos(files, { folder = "good_news_photos" } = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in to upload photos.");

    if (!files || !files.length) return [];

    const storage = getStorage();
    const urls = [];

    for (const file of files) {
        if (!file) continue;

        // Simple client-side guard
        if (!file.type?.startsWith("image/")) {
            throw new Error(`Only images are supported for Good News photos. File: ${file.name}`);
        }

        const stamp = new Date().toISOString().replaceAll(":", "-");
        const path = `${folder}/${user.uid}/${stamp}_${sanitizeFilename(file.name)}`;
        const storageRef = ref(storage, path);

        await uploadBytes(storageRef, file, {
            contentType: file.type || "application/octet-stream",
            cacheControl: "public,max-age=31536000",
        });

        const url = await getDownloadURL(storageRef);
        urls.push(url);
    }

    return urls;
}

function sanitizeFilename(name) {
    return String(name || "file")
        .replaceAll("..", ".")
        .replaceAll("/", "_")
        .replaceAll("\\", "_");
}
