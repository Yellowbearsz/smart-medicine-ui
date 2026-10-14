import React, { useEffect, useState } from "react";
import { Lock, LockOpen, Clock3, DoorClosed, CalendarDays, PillBottle } from "lucide-react";
import { ref, onValue, set } from "firebase/database";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "./firebase";

const OFFLINE_AFTER_SECONDS = 30;

export default function App() {
  const [onlineFlag, setOnlineFlag] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastSeenEpoch, setLastSeenEpoch] = useState(0);
  const [isLocked, setIsLocked] = useState(true);
  const [nextDose, setNextDose] = useState("--:--");
  const [cabinetStatus, setCabinetStatus] = useState("-");
  const [lastOpened, setLastOpened] = useState("-");
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let unsubscribe = null;

    signInAnonymously(auth)
      .then(() => {
        setFirebaseReady(true);

        const deviceRef = ref(db, "smartMedicineCabinet/device/cabinet01");

        unsubscribe = onValue(deviceRef, (snapshot) => {
          if (!snapshot.exists()) {
            setOnlineFlag(false);
            setLastSeenEpoch(0);
            return;
          }

          const data = snapshot.val();

          setOnlineFlag(data.online === true);
          setLastSeenEpoch(Number(data.lastSeenEpoch || 0));
          setIsLocked(data.lockStatus === "LOCKED");
          setNextDose(data.nextDose || "--:--");
          setCabinetStatus(data.doorStatus || "-");
          setLastOpened(data.lastOpened || "-");
        });
      })
      .catch(() => {
        setFirebaseReady(false);
        setConnected(false);
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const checkHeartbeat = () => {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const age = nowEpoch - lastSeenEpoch;

      const fresh =
        lastSeenEpoch > 0 &&
        age >= 0 &&
        age <= OFFLINE_AFTER_SECONDS;

      setConnected(onlineFlag && fresh);
    };

    checkHeartbeat();
    const timer = setInterval(checkHeartbeat, 5000);
    return () => clearInterval(timer);
  }, [onlineFlag, lastSeenEpoch]);

  const unlockCabinet = async () => {
    await set(ref(db, "smartMedicineCabinet/commands/cabinet01/lock"), "UNLOCK");
  };

  const lockCabinet = async () => {
    await set(ref(db, "smartMedicineCabinet/commands/cabinet01/lock"), "LOCK");
  };

  return (
    <main className="page">
      <section className="phone-panel">
        <header className="header">
          <div className="logo-box">
            <PillBottle size={34} strokeWidth={2.2} />
          </div>

          <h1>Smart Medicine Cabinet</h1>

          <div className="connection">
            <span className={`status-dot ${connected ? "online" : "offline"}`} />
            <span>{connected ? "Connected (ESP32)" : "Disconnected"}</span>
          </div>
        </header>

        <div className="actions">
          <button
            type="button"
            className={`action-button unlock ${!isLocked ? "active" : ""}`}
            onClick={unlockCabinet}
            disabled={!firebaseReady}
          >
            <LockOpen size={39} strokeWidth={2.2} />
            <strong>UNLOCK</strong>
            <span>({!isLocked ? "ON" : "OFF"})</span>
          </button>

          <button
            type="button"
            className={`action-button lock ${isLocked ? "active" : ""}`}
            onClick={lockCabinet}
            disabled={!firebaseReady}
          >
            <Lock size={39} strokeWidth={2.2} />
            <strong>LOCK</strong>
            <span>({isLocked ? "ON" : "OFF"})</span>
          </button>
        </div>

        <div className="info-list">
          <InfoCard icon={<Clock3 size={26} />} iconClass="green" label="Next Dose" value={nextDose} />
          <InfoCard icon={<DoorClosed size={26} />} iconClass="blue" label="Cabinet Status" value={cabinetStatus} valueClass={cabinetStatus === "CLOSED" ? "success" : ""} />
          <InfoCard icon={<CalendarDays size={26} />} iconClass="green" label="Last Opened" value={lastOpened} />
        </div>
      </section>
    </main>
  );
}

function InfoCard({ icon, iconClass, label, value, valueClass = "" }) {
  return (
    <article className="info-card">
      <div className={`info-icon ${iconClass}`}>{icon}</div>
      <div className="info-text">
        <div className="info-label">{label}</div>
        <div className={`info-value ${valueClass}`}>{value}</div>
      </div>
    </article>
  );
}
