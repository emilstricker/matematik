/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  ChevronRight, 
  Calendar, 
  GraduationCap, 
  Eye, 
  EyeOff, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  ChevronLeft,
  LogIn,
  LogOut,
  User as UserIcon,
  Star
} from 'lucide-react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  FirebaseUser,
  doc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  OperationType,
  handleFirestoreError,
  increment,
  onSnapshot
} from './firebase';

class ErrorBoundary extends React.Component<any, { hasError: boolean; error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border-2 border-rose-100">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Ups! Der skete en fejl</h2>
            <p className="text-slate-600 mb-6">
              Vi beklager ulejligheden. Prøv at genindlæse siden.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Genindlæs siden
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// Simple seedable random number generator
const seededRandom = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  
  return () => {
    h = Math.imul(48271, h) | 0;
    return (h >>> 0) / 4294967296; // Use 2^32 to ensure range [0, 1)
  };
};

type GradeLevel = '0-1' | '2-3' | '4-6' | '7-9';

interface Problem {
  question: string;
  answer: string;
  type: 'plus' | 'minus' | 'gange' | 'division' | 'decimal' | 'procent' | 'brøk';
  hint: string;
  explanation: string;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState<GradeLevel | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [today, setToday] = useState('');
  const [userInput, setUserInput] = useState('');
  const [hintUsed, setHintUsed] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'correct-with-hint' | 'incorrect' | 'needs-simplification' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [completedGrades, setCompletedGrades] = useState<string[]>([]);
  const [userPoints, setUserPoints] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Update user profile in Firestore
        const userRef = doc(db, 'users', u.uid);
        setDoc(userRef, {
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL,
          createdAt: serverTimestamp()
        }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch user points
  useEffect(() => {
    if (!user) {
      setUserPoints(0);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserPoints(docSnap.data().points || 0);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));
    return () => unsubscribe();
  }, [user]);

  // Fetch completed grades for the selected date
  useEffect(() => {
    if (!user) {
      setCompletedGrades([]);
      return;
    }
    const q = query(collection(db, 'completions'), where('uid', '==', user.uid), where('date', '==', selectedDate));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const grades = snapshot.docs.map(doc => doc.data().grade);
      setCompletedGrades(grades);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'completions'));
    return () => unsubscribe();
  }, [user, selectedDate]);

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Login vindue blev lukket af brugeren.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log("Login forsøg blev annulleret pga. en ny anmodning.");
      } else {
        console.error("Login fejl:", error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  useEffect(() => {
    setShowHint(false);
    setShowExplanation(false);
    setUserInput('');
    setHintUsed(false);
    setFeedback(null);
  }, [selectedDate, grade]);

  useEffect(() => {
    if (showHint) setHintUsed(true);
  }, [showHint]);

  const checkAnswer = async () => {
    if (!problem) return;
    
    const normalizedInput = userInput.trim().replace('.', ',');
    const normalizedAnswer = problem.answer.trim();

    let isCorrect = normalizedInput === normalizedAnswer;
    let needsSimplification = false;

    if (!isCorrect && problem.type === 'brøk' && normalizedInput.includes('/')) {
      const [inN, inD] = normalizedInput.split('/').map(Number);
      const [ansN, ansD] = normalizedAnswer.includes('/') 
        ? normalizedAnswer.split('/').map(Number) 
        : [Number(normalizedAnswer), 1];
        
      if (!isNaN(inN) && !isNaN(inD) && inD !== 0 && inN * ansD === ansN * inD) {
        needsSimplification = true;
      }
    }

    if (isCorrect) {
      const isCorrectWithHint = hintUsed;
      setFeedback(isCorrectWithHint ? 'correct-with-hint' : 'correct');
      setShowExplanation(true);

      // Record completion if user is logged in and hasn't completed it yet
      if (user && !isSaving && !completedGrades.includes(grade)) {
        setIsSaving(true);
        try {
          const pointsToAward = isCorrectWithHint ? 5 : 10;
          await addDoc(collection(db, 'completions'), {
            uid: user.uid,
            date: selectedDate,
            grade: grade,
            hintUsed: isCorrectWithHint,
            pointsEarned: pointsToAward,
            timestamp: serverTimestamp()
          });
          // Update user points
          await setDoc(doc(db, 'users', user.uid), {
            points: increment(pointsToAward)
          }, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'completions');
        } finally {
          setIsSaving(false);
        }
      }
    } else if (needsSimplification) {
      setFeedback('needs-simplification');
    } else {
      setFeedback('incorrect');
    }
  };

  useEffect(() => {
    const date = new Date(selectedDate);
    setToday(date.toLocaleDateString('da-DK', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }));
  }, [selectedDate]);

  const problem = useMemo(() => {
    if (!grade) return null;

    const dateStr = selectedDate;
    const seed = `${dateStr}-${grade}`;
    const rng = seededRandom(seed);

    const getRandomInt = (min: number, max: number) => {
      return Math.floor(rng() * (max - min + 1)) + min;
    };

    let availableTypes: Problem['type'][] = ['plus', 'minus'];
    if (grade === '2-3') availableTypes.push('gange');
    if (grade === '4-6') availableTypes.push('gange', 'division', 'decimal', 'procent');
    if (grade === '7-9') availableTypes.push('gange', 'division', 'decimal', 'procent', 'brøk');
    
    const type = availableTypes[Math.floor(rng() * availableTypes.length)];

    let num1 = 0;
    let num2 = 0;
    let question = '';
    let answer = '';

    switch (grade) {
      case '0-1':
        if (type === 'plus') {
          num1 = getRandomInt(1, 10);
          num2 = getRandomInt(1, 10);
          question = `${num1} + ${num2}`;
          answer = (num1 + num2).toString();
        } else {
          num1 = getRandomInt(5, 15);
          num2 = getRandomInt(1, num1);
          question = `${num1} - ${num2}`;
          answer = (num1 - num2).toString();
        }
        break;
      case '2-3':
        if (type === 'plus') {
          num1 = getRandomInt(10, 100);
          num2 = getRandomInt(10, 100);
          question = `${num1} + ${num2}`;
          answer = (num1 + num2).toString();
        } else if (type === 'minus') {
          num1 = getRandomInt(50, 150);
          num2 = getRandomInt(10, num1);
          question = `${num1} - ${num2}`;
          answer = (num1 - num2).toString();
        } else {
          num1 = getRandomInt(2, 10);
          num2 = getRandomInt(2, 10);
          question = `${num1} × ${num2}`;
          answer = (num1 * num2).toString();
        }
        break;
      case '4-6':
        if (type === 'plus') {
          num1 = getRandomInt(100, 1000);
          num2 = getRandomInt(100, 1000);
          question = `${num1} + ${num2}`;
          answer = (num1 + num2).toString();
        } else if (type === 'minus') {
          num1 = getRandomInt(500, 2000);
          num2 = getRandomInt(100, num1);
          question = `${num1} - ${num2}`;
          answer = (num1 - num2).toString();
        } else if (type === 'gange') {
          num1 = getRandomInt(5, 20);
          num2 = getRandomInt(5, 20);
          question = `${num1} × ${num2}`;
          answer = (num1 * num2).toString();
        } else if (type === 'division') {
          const res = getRandomInt(2, 15);
          num2 = getRandomInt(2, 10);
          num1 = res * num2;
          question = `${num1} ÷ ${num2}`;
          answer = res.toString();
        } else if (type === 'decimal') {
          const d1 = getRandomInt(1, 50) + getRandomInt(1, 9) / 10;
          const d2 = getRandomInt(1, 50) + getRandomInt(1, 9) / 10;
          num1 = d1;
          num2 = d2;
          question = `${d1.toString().replace('.', ',')} + ${d2.toString().replace('.', ',')}`;
          answer = (Math.round((d1 + d2) * 10) / 10).toString().replace('.', ',');
        } else if (type === 'procent') {
          const percents = [10, 20, 25, 50];
          const p = percents[Math.floor(rng() * percents.length)];
          num1 = getRandomInt(1, 10) * 100;
          num2 = p;
          question = `${p}% af ${num1}`;
          answer = (num1 * (p / 100)).toString();
        }
        break;
      case '7-9':
        if (type === 'plus') {
          num1 = getRandomInt(1000, 10000);
          num2 = getRandomInt(1000, 10000);
          question = `${num1} + ${num2}`;
          answer = (num1 + num2).toString();
        } else if (type === 'minus') {
          num1 = getRandomInt(5000, 20000);
          num2 = getRandomInt(1000, num1);
          question = `${num1} - ${num2}`;
          answer = (num1 - num2).toString();
        } else if (type === 'gange') {
          num1 = getRandomInt(10, 50);
          num2 = getRandomInt(10, 50);
          question = `${num1} × ${num2}`;
          answer = (num1 * num2).toString();
        } else if (type === 'division') {
          const res = getRandomInt(10, 100);
          num2 = getRandomInt(5, 20);
          num1 = res * num2;
          question = `${num1} ÷ ${num2}`;
          answer = res.toString();
        } else if (type === 'decimal') {
          const d1 = getRandomInt(10, 100) + getRandomInt(1, 99) / 100;
          const d2 = getRandomInt(10, 100) + getRandomInt(1, 99) / 100;
          num1 = d1;
          num2 = d2;
          question = `${d1.toString().replace('.', ',')} + ${d2.toString().replace('.', ',')}`;
          answer = (Math.round((d1 + d2) * 100) / 100).toString().replace('.', ',');
        } else if (type === 'procent') {
          const p = getRandomInt(1, 19) * 5;
          num1 = getRandomInt(1, 20) * 50;
          num2 = p;
          question = `${p}% af ${num1}`;
          answer = (num1 * (p / 100)).toString();
        } else if (type === 'brøk') {
          const commonDenom = getRandomInt(2, 10);
          const n1 = getRandomInt(1, commonDenom - 1);
          const n2 = getRandomInt(1, commonDenom - 1);
          num1 = n1;
          num2 = n2;
          question = `${n1}/${commonDenom} + ${n2}/${commonDenom}`;
          const sumN = n1 + n2;
          const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
          const common = gcd(sumN, commonDenom);
          const finalN = sumN / common;
          const finalD = commonDenom / common;
          answer = finalD === 1 ? finalN.toString() : `${finalN}/${finalD}`;
        }
        break;
    }

    let hint = '';
    let explanation = '';

    if (type === 'plus') {
      const n1 = num1;
      const n2 = num2;
      explanation = `For at lægge ${n1} og ${n2} sammen, kan vi dele dem op:\n\n`;
      if (n1 > 10 || n2 > 10) {
        hint = 'Prøv at dele tallene op i enere, tiere og hundreder.';
        const getParts = (n: number) => {
          return {
            thousands: Math.floor(n / 1000) * 1000,
            hundreds: Math.floor((n % 1000) / 100) * 100,
            tens: Math.floor((n % 100) / 10) * 10,
            ones: n % 10
          };
        };
        const p1 = getParts(n1);
        const p2 = getParts(n2);
        const explParts = [];
        if (p1.thousands > 0 || p2.thousands > 0) explParts.push(`Tusinder: ${p1.thousands.toString().padStart(4)} + ${p2.thousands.toString().padStart(4)} = ${(p1.thousands + p2.thousands).toString().padStart(4)}`);
        if (p1.hundreds > 0 || p2.hundreds > 0) explParts.push(`Hundreder: ${p1.hundreds.toString().padStart(4)} + ${p2.hundreds.toString().padStart(4)} = ${(p1.hundreds + p2.hundreds).toString().padStart(4)}`);
        if (p1.tens > 0 || p2.tens > 0) explParts.push(`Tiere:     ${p1.tens.toString().padStart(4)} + ${p2.tens.toString().padStart(4)} = ${(p1.tens + p2.tens).toString().padStart(4)}`);
        if (p1.ones > 0 || p2.ones > 0) explParts.push(`Enere:     ${p1.ones.toString().padStart(4)} + ${p2.ones.toString().padStart(4)} = ${(p1.ones + p2.ones).toString().padStart(4)}`);
        explanation += explParts.join('\n') + `\n\nResultat: ${answer}`;
      } else {
        hint = 'Prøv at tælle på fingrene eller brug en tallinje.';
        explanation = `Vi starter ved ${n1} og tæller ${n2} fremad:\n${n1} -> ${Array.from({length: n2}, (_, i) => n1 + i + 1).join(' -> ')}\n\nResultat: ${answer}`;
      }
    } else if (type === 'minus') {
      const n1 = num1;
      const n2 = num2;
      explanation = `For at trække ${n2} fra ${n1}, kan vi gøre det i bidder:\n\n`;
      if (n1 > 10) {
        if (n1 >= 1000) {
          hint = 'Prøv at trække tallene fra hinanden i bidder (tusinder, hundreder, tiere, enere).';
        } else if (n1 >= 100) {
          hint = 'Prøv at trække tallene fra hinanden i bidder (hundreder, tiere, enere).';
        } else {
          hint = 'Prøv at trække tallene fra hinanden i bidder (først tiere, så enere).';
        }
        const n2_10000 = Math.floor(n2 / 10000) * 10000;
        const n2_1000 = Math.floor((n2 % 10000) / 1000) * 1000;
        const n2_100 = Math.floor((n2 % 1000) / 100) * 100;
        const n2_10 = Math.floor((n2 % 100) / 10) * 10;
        const n2_1 = n2 % 10;
        
        const explParts = [];
        let current = n1;
        if (n2_10000 > 0) {
          explParts.push(`${current.toString().padStart(5)} - ${n2_10000.toString().padStart(5)} = ${(current - n2_10000).toString().padStart(5)}`);
          current -= n2_10000;
        }
        if (n2_1000 > 0) {
          explParts.push(`${current.toString().padStart(5)} - ${n2_1000.toString().padStart(5)} = ${(current - n2_1000).toString().padStart(5)}`);
          current -= n2_1000;
        }
        if (n2_100 > 0) {
          explParts.push(`${current.toString().padStart(5)} - ${n2_100.toString().padStart(5)} = ${(current - n2_100).toString().padStart(5)}`);
          current -= n2_100;
        }
        if (n2_10 > 0) {
          explParts.push(`${current.toString().padStart(5)} - ${n2_10.toString().padStart(5)} = ${(current - n2_10).toString().padStart(5)}`);
          current -= n2_10;
        }
        if (n2_1 > 0) {
          explParts.push(`${current.toString().padStart(5)} - ${n2_1.toString().padStart(5)} = ${(current - n2_1).toString().padStart(5)}`);
        }
        explanation += explParts.join('\n') + `\n\nResultat: ${answer}`;
      } else {
        hint = 'Tæl baglæns fra det største tal.';
        explanation = `Vi starter ved ${n1} og tæller ${n2} baglæns:\n${n1} -> ${Array.from({length: n2}, (_, i) => n1 - i - 1).join(' -> ')}\n\nResultat: ${answer}`;
      }
    } else if (type === 'gange') {
      const n1 = num1;
      const n2 = num2;
      explanation = `At gange ${n1} med ${n2} betyder at lægge ${n1} sammen ${n2} gange.\n\n`;
      if (n1 > 10 || n2 > 10) {
        hint = `Prøv at dele regnestykket op. For eksempel kan du regne ${Math.floor(n1/10)*10} × ${n2} og ${n1%10} × ${n2} hver for sig.`;
        const n1_10 = Math.floor(n1 / 10) * 10;
        const n1_1 = n1 % 10;
        const n2_10 = Math.floor(n2 / 10) * 10;
        const n2_1 = n2 % 10;
        
        const explParts = [];
        if (n1_10 > 0 && n2_10 > 0) explParts.push(`${n1_10.toString().padStart(2)} × ${n2_10.toString().padStart(2)} = ${(n1_10 * n2_10).toString().padStart(4)}`);
        if (n1_10 > 0 && n2_1 > 0) explParts.push(`${n1_10.toString().padStart(2)} × ${n2_1.toString().padStart(2)} = ${(n1_10 * n2_1).toString().padStart(4)}`);
        if (n1_1 > 0 && n2_10 > 0) explParts.push(`${n1_1.toString().padStart(2)} × ${n2_10.toString().padStart(2)} = ${(n1_1 * n2_10).toString().padStart(4)}`);
        if (n1_1 > 0 && n2_1 > 0) explParts.push(`${n1_1.toString().padStart(2)} × ${n2_1.toString().padStart(2)} = ${(n1_1 * n2_1).toString().padStart(4)}`);
        explanation += `Vi kan dele regnestykket op:\n` + explParts.join('\n') + `\n\nNår vi lægger resultaterne sammen, får vi ${answer}.`;
      } else {
        hint = `Tænk på ${n1}-tabellen eller ${n2}-tabellen.`;
        explanation = `${n1}-tabellen talt ${n2} gange:\n${Array.from({length: n2}, (_, i) => n1 * (i + 1)).join(' -> ')}\n\nResultat: ${answer}`;
      }
    } else if (type === 'division') {
      hint = `Hvilket tal skal du gange med ${num2} for at få ${num1}?\n? × ${num2} = ${num1}`;
      explanation = `Division er det modsatte af at gange.\n\nVi skal finde ud af, hvor mange gange ${num2} går op i ${num1}.\nDa ${answer} × ${num2} = ${num1}, er svaret ${answer}.`;
    } else if (type === 'decimal') {
      hint = `Husk at stille tallene op under hinanden, så kommaerne står præcis over hinanden.`;
      const s1 = num1.toString().replace('.', ',');
      const s2 = num2.toString().replace('.', ',');
      const sa = answer;
      
      const parts1 = s1.split(',');
      const parts2 = s2.split(',');
      const partsA = sa.split(',');
      
      const intLen = Math.max(parts1[0].length, parts2[0].length, partsA[0].length);
      const decLen = Math.max(
        parts1[1]?.length || 0, 
        parts2[1]?.length || 0, 
        partsA[1]?.length || 0
      );

      const formatDecimal = (s: string) => {
        const [int, dec = ''] = s.split(',');
        return int.padStart(intLen) + ',' + dec.padEnd(decLen);
      };

      const f1 = formatDecimal(s1);
      const f2 = formatDecimal(s2);
      const fa = formatDecimal(sa);
      const lineLen = intLen + decLen + 3;

      explanation = `Når vi lægger kommatal sammen, skal kommaerne stå lige under hinanden:\n\n  ${f1}\n+ ${f2}\n${'-'.repeat(lineLen)}\n  ${fa}`;
    } else if (type === 'procent') {
      hint = `100% er det hele (${num1}).\n10% er en tiendedel (${num1 / 10}).\n1% er en hundrededel (${num1 / 100}).`;
      explanation = `For at finde ${num2}% af ${num1}:\n\n1. Find 1%: ${num1} ÷ 100 = ${num1 / 100}\n2. Gang med ${num2}: ${num1 / 100} × ${num2} = ${answer}`;
    } else if (type === 'brøk') {
      const commonDenom = Number(question.split('/')[1].split(' ')[0]);
      const t1 = Number(question.split('/')[0]);
      const t2 = Number(question.split('+ ')[1].split('/')[0]);
      const sumN = t1 + t2;
      
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const common = gcd(sumN, commonDenom);
      
      const centerText = (text: string, width: number) => {
        const padLeft = Math.floor((width - text.length) / 2);
        const padRight = width - text.length - padLeft;
        return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
      };

      const formatFrac = (n: number | string, d: number | string) => {
        const nStr = String(n);
        const dStr = String(d);
        const width = Math.max(nStr.length, dStr.length) + 2;
        const bar = '-'.repeat(width);
        return {
          num: centerText(nStr, width),
          bar: bar,
          den: centerText(dStr, width)
        };
      };

      const f1 = formatFrac(t1, commonDenom);
      const f2 = formatFrac(t2, commonDenom);
      const f3 = formatFrac(sumN, commonDenom);

      let baseExplanation = `Når vi lægger brøker med samme nævner sammen, beholder vi nævneren (${commonDenom}) og lægger tællerne sammen:\n\n` +
        `  ${f1.num}   ${f2.num}   ${f3.num}\n` +
        `  ${f1.bar} + ${f2.bar} = ${f3.bar}\n` +
        `  ${f1.den}   ${f2.den}   ${f3.den}`;
      
      if (common > 1) {
        if (commonDenom / common === 1) {
          baseExplanation += `\n\nBrøken ${sumN}/${commonDenom} er det samme som et helt tal. Vi dividerer ${sumN} med ${commonDenom} og får ${answer}.`;
        } else {
          const fSimpLeft = formatFrac(`${sumN} ÷ ${common}`, `${commonDenom} ÷ ${common}`);
          const fSimpRight = formatFrac(sumN / common, commonDenom / common);
          baseExplanation += `\n\nTil sidst forkorter vi brøken ved at dividere tæller og nævner med deres største fælles divisor, som er ${common}:\n\n` +
            `  ${fSimpLeft.num}   ${fSimpRight.num}\n` +
            `  ${fSimpLeft.bar} = ${fSimpRight.bar}\n` +
            `  ${fSimpLeft.den}   ${fSimpRight.den}`;
        }
      }
      
      explanation = baseExplanation;
      
      if (common > 1) {
        hint = `Husk at forkorte brøken til sidst, hvis det er muligt.`;
      } else {
        hint = `Læg tællerne (de øverste tal) sammen og behold nævneren (det nederste tal).`;
      }
    }

    return { question, answer, type, hint, explanation };
  }, [grade, selectedDate]);

  const gradeLabels: Record<GradeLevel, string> = {
    '0-1': '0. - 1. klasse',
    '2-3': '2. - 3. klasse',
    '4-6': '4. - 6. klasse',
    '7-9': '7. - 9. klasse',
  };

  const typeLabels: Record<string, string> = {
    plus: 'PLUS',
    minus: 'MINUS',
    gange: 'GANGE',
    division: 'DIVISION',
    decimal: 'KOMMATAL',
    procent: 'PROCENT',
    brøk: 'BRØK',
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Calculator size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
              Dagens Matematik
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full font-bold text-sm shadow-sm border border-amber-200">
                <Star size={16} className="fill-amber-500 text-amber-500" />
                <span>{userPoints} pt</span>
              </div>
            )}
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-800">{user.displayName}</span>
                  <button onClick={logout} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-wider transition-colors">Log ud</button>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                    <UserIcon size={20} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button 
                  onClick={login}
                  className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all"
                >
                  <LogIn size={18} />
                  <span>Log ind</span>
                </button>
                <p className="text-[9px] text-slate-400 font-medium hidden sm:block">
                  Virker det ikke? Prøv at åbne appen i en ny fane.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium bg-slate-100 px-3 py-1.5 rounded-full">
              <Calendar size={16} className="text-indigo-500" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setShowHint(false);
                }}
                className="bg-transparent border-none focus:ring-0 cursor-pointer text-slate-700 font-bold"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {!grade ? (
            <motion.div
              key="select-grade"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto text-center"
            >
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
                Velkommen til dagens opgave!
              </h2>
              <p className="text-slate-600 text-lg mb-10">
                Vælg dit klassetrin for at se dagens matematikudfordring.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(Object.keys(gradeLabels) as GradeLevel[]).map((level) => {
                  const isCompleted = completedGrades.includes(level);
                  return (
                    <button
                      key={level}
                      onClick={() => setGrade(level)}
                      className={`group relative p-6 rounded-2xl border-2 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex items-center justify-between ${
                        isCompleted 
                          ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400' 
                          : 'bg-white border-transparent hover:border-indigo-500'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                        }`}>
                          {isCompleted ? <CheckCircle2 size={24} /> : <GraduationCap size={24} />}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-lg font-bold transition-colors ${
                            isCompleted ? 'text-emerald-700' : 'text-slate-700 group-hover:text-indigo-600'
                          }`}>
                            {gradeLabels[level]}
                          </span>
                          {isCompleted && (
                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                              Løst
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={20} className={`${
                        isCompleted ? 'text-emerald-400 group-hover:text-emerald-600' : 'text-slate-300 group-hover:text-indigo-500'
                      } group-hover:translate-x-1 transition-all`} />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="problem-view"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 overflow-hidden border border-slate-100">
                <div className="bg-indigo-600 px-8 py-6 text-white flex items-center justify-between">
                  <div className="flex items-end gap-4">
                    <div>
                      <span className="text-indigo-100 text-xs font-bold uppercase tracking-widest">Dagens opgave</span>
                      <h3 className="text-xl font-bold">{gradeLabels[grade]}</h3>
                    </div>
                    <button
                      onClick={() => {
                        setGrade(null);
                        setShowHint(false);
                        setShowExplanation(false);
                      }}
                      className="mb-0.5 flex items-center gap-1.5 text-indigo-200 hover:text-white text-sm font-bold transition-all bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg"
                    >
                      <ChevronLeft size={14} />
                      Skift
                    </button>
                  </div>
                  <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                    <Calculator size={28} />
                  </div>
                </div>

                <div className="p-8 sm:p-16 text-center">
                  {problem?.type && (
                    <div className="inline-flex items-center justify-center px-4 py-1 rounded-full bg-indigo-50 text-indigo-600 text-sm font-bold mb-12">
                      {typeLabels[problem.type] || problem.type.toUpperCase()}
                    </div>
                  )}
                  
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 mb-12">
                    <div className="text-5xl sm:text-7xl lg:text-8xl font-serif font-bold text-slate-900 tracking-tight">
                      {problem?.question}
                    </div>
                    <div className="text-5xl sm:text-7xl lg:text-8xl font-serif font-bold text-slate-300">
                      =
                    </div>
                    <div className="relative w-40 sm:w-64">
                      <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                        placeholder="?"
                        className={`
                          w-full py-6 sm:py-8 text-4xl sm:text-6xl font-serif font-bold text-center bg-white border-4 rounded-3xl transition-all duration-300 outline-none shadow-inner
                          ${feedback === 'correct' || feedback === 'correct-with-hint' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 
                            feedback === 'incorrect' ? 'border-rose-400 bg-rose-50 text-rose-700' :
                            'border-slate-100 focus:border-indigo-400 focus:shadow-indigo-100'}
                        `}
                      />
                      {(feedback === 'correct' || feedback === 'correct-with-hint') && (
                        <motion.div 
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-4 -right-4 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg border-4 border-white"
                        >
                          <CheckCircle2 size={24} strokeWidth={3} />
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <div className="w-full max-w-lg mx-auto mb-12">
                    <button
                      onClick={checkAnswer}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:-translate-y-0.5 active:translate-y-0"
                    >
                      <Send size={20} />
                      <span>Tjek svar</span>
                    </button>

                    <AnimatePresence mode="wait">
                      {feedback && (
                        <motion.div
                          key={feedback}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mt-6 flex items-center justify-center gap-3"
                        >
                          {(feedback === 'correct' || feedback === 'correct-with-hint') ? (
                            <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100">
                              <CheckCircle2 size={24} />
                              <span>{feedback === 'correct' ? 'Rigtigt! Flot klaret!' : 'Rigtigt! (Godt brugt hint)'}</span>
                            </div>
                          ) : feedback === 'needs-simplification' ? (
                            <div className="flex items-center gap-2 text-amber-600 font-bold bg-amber-50 px-6 py-3 rounded-2xl border border-amber-100">
                              <AlertCircle size={24} />
                              <span>Næsten! Kan du forkorte brøken?</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-rose-600 font-bold bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100">
                              <XCircle size={24} />
                              <span>Ikke helt rigtigt. Prøv igen!</span>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex flex-col items-center gap-6">
                    <div className="flex flex-wrap justify-center gap-4">
                      <button
                        onClick={() => setShowHint(!showHint)}
                        className={`
                          flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all duration-300
                          ${showHint 
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                            : 'bg-white text-amber-600 border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50'}
                        `}
                      >
                        <RefreshCw size={20} className={showHint ? 'rotate-180' : ''} />
                        {showHint ? 'Skjul hint' : 'Få et hint'}
                      </button>
                    </div>

                    <AnimatePresence>
                      {showHint && !showExplanation && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="w-full max-w-md bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left"
                        >
                          <div className="flex items-center gap-2 text-amber-700 font-bold mb-3">
                            <RefreshCw size={18} />
                            <span>Hint:</span>
                          </div>
                          <div className="text-amber-900 font-mono whitespace-pre-line leading-relaxed">
                            {problem?.hint}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {showExplanation && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          className="w-full max-w-2xl bg-white rounded-3xl border-2 border-slate-100 shadow-xl overflow-hidden mt-8"
                        >
                          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Løsningsforslag</span>
                          </div>
                          <div className="p-8 text-left space-y-6">
                            {problem?.explanation.split('\n\n').map((part, index) => {
                              const isCalculation = part.includes('\n') || part.includes('---') || part.includes('+ ') || part.includes('- ') || part.includes('× ') || part.includes('÷ ');
                              
                              if (isCalculation) {
                                return (
                                  <div key={index} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 overflow-x-auto">
                                    <pre className="font-mono text-sm sm:text-base leading-relaxed text-slate-700 whitespace-pre">
                                      {part}
                                    </pre>
                                  </div>
                                );
                              }
                              
                              return (
                                <p key={index} className="text-slate-700 leading-relaxed text-lg">
                                  {part}
                                </p>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="bg-slate-50 px-8 py-6 border-t border-slate-100 flex items-center justify-center gap-8 text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                    <span className="text-xs font-bold uppercase tracking-tighter">Samme opgave for alle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                    <span className="text-xs font-bold uppercase tracking-tighter">Nulstilles i morgen</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-12 text-center text-slate-400 text-sm">
                Brug denne side til fælles gennemgang i klassen.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
