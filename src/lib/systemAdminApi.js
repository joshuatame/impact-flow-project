/**************************************************************************************************
 * FILE: src/lib/systemAdminApi.js
 * NEW FILE: small wrapper for callable functions
 **************************************************************************************************/
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

export async function systemAdminListCollections() {
    const fn = httpsCallable(functions, "systemAdminListCollections");
    const res = await fn({});
    return res.data?.collections || [];
}

export async function systemAdminGetCollectionSchema(collectionName, sampleSize = 25) {
    const fn = httpsCallable(functions, "systemAdminGetCollectionSchema");
    const res = await fn({ collectionName, sampleSize });
    return res.data;
}