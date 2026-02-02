// src/services/participants.js
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const PARTICIPANTS_COLLECTION = "participants";

export async function createParticipant(data) {
  const docRef = await addDoc(collection(db, PARTICIPANTS_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function listParticipants() {
  const snapshot = await getDocs(collection(db, PARTICIPANTS_COLLECTION));
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function updateParticipant(id, data) {
  const ref = doc(db, PARTICIPANTS_COLLECTION, id);
  await updateDoc(ref, data);
}

export async function deleteParticipant(id) {
  const ref = doc(db, PARTICIPANTS_COLLECTION, id);
  await deleteDoc(ref);
}
