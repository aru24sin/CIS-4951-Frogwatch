import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

export const verifyAnswers = onCall({ region: "us-central1" }, async (req) => {
  const email = String(req.data?.email || "").trim().toLowerCase();
  const answers: string[] = Array.isArray(req.data?.answers) ? req.data.answers : [];
  if (!email || answers.length !== 3) throw new HttpsError("invalid-argument","Email and 3 answers required.");

  const norm = (s:any) => String(s ?? "").trim().toLowerCase();
  try {
    const user = await getAuth().getUserByEmail(email);
    const snap = await db.doc(`users/${user.uid}`).get();
    const sec = (snap.data()?.security) ?? {};
    const ok = norm(answers[0])===norm(sec.q1) && norm(answers[1])===norm(sec.q2) && norm(answers[2])===norm(sec.q3);
    // return generic status; client decides what to do
    return { status: "ok", allow: !!ok };
  } catch {
    return { status: "ok", allow: false };
  }
});
