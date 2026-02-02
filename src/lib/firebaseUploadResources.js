import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "@/firebase";

// Uploads a file to Firebase Storage and returns { downloadUrl, fileName }.
// Uses the signed-in user (if available) for a sensible path namespace.
export async function uploadResourceFile(file, { folder = "resources" } = {}) {
    if (!file) throw new Error("No file provided.");

    const user = auth.currentUser;
    const uid = user?.uid || "anonymous";

    const storage = getStorage();

    const safeName = (file.name || "file")
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 180);

    const stamp = Date.now();
    const path = `${folder}/${uid}/${stamp}_${safeName}`;

    const storageRef = ref(storage, path);

    const metadata = {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
            uploadedByUid: uid,
            originalName: file.name || "",
        },
    };

    await uploadBytes(storageRef, file, metadata);
    const downloadUrl = await getDownloadURL(storageRef);

    return { downloadUrl, fileName: file.name || safeName, path };
}
