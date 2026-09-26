import React, { useEffect, useState } from "react";

import {
  Lock,
  LockOpen,
  Clock3,
  DoorClosed,
  CalendarDays,
  PillBottle,
} from "lucide-react";

import { ref, onValue, set } from "firebase/database";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "./firebase";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [nextDose, setNextDose] = useState("--:--");
  const [cabinetStatus, setCabinetStatus] = useState("-");
  const [lastOpened, setLastOpened] = useState("-");
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let unsubscribe = null;

    signInAnonymously(auth)
      .then(() => {
        console.log("Firebase Anonymous Login OK");
        setFirebaseReady(true);

        const deviceRef = ref(
          db,
          "smartMedicineCabinet/device/cabinet01"
        );

        unsubscribe = onValue(
          deviceRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              console.log("No device data");
              return;
            }

            const data = snapshot.val();

            setConnected(data.online === true);
            setIsLocked(data.lockStatus === "LOCKED");
            setNextDose(data.nextDose || "--:--");
            setCabinetStatus(data.doorStatus || "-");
            setLastOpened(data.lastOpened || "-");
          },
          (error) => {
            console.error("RTDB Listener Error:", error);
          }
        );
      })
      .catch((error) => {
        console.error("Firebase Auth Error:", error);
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const unlockCabinet = async () => {
    try {
      await set(
        ref(db, "smartMedicineCabinet/commands/cabinet01/lock"),
        "UNLOCK"
      );
      console.log("UNLOCK command sent");
    } catch (error) {
      console.error("UNLOCK Error:", error);
    }
  };

  const lockCabinet = async () => {
    try {
      await set(
        ref(db, "smartMedicineCabinet/commands/cabinet01/lock"),
        "LOCK"
      );
      console.log("LOCK command sent");
    } catch (error) {
      console.error("LOCK Error:", error);
    }
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
            <span
              className={`status-dot ${
                connected ? "online" : "offline"
              }`}
            />
            <span>
              {connected ? "Connected (ESP32)" : "Disconnected"}
            </span>
          </div>
        </header>

        <div className="actions">
          <button
            type="button"
            className={`action-button unlock ${
              !isLocked ? "active" : ""
            }`}
            onClick={unlockCabinet}
            disabled={!firebaseReady}
          >
            <LockOpen size={39} strokeWidth={2.2} />
            <strong>UNLOCK</strong>
            <span>({!isLocked ? "ON" : "OFF"})</span>
          </button>

          <button
            type="button"
            className={`action-button lock ${
              isLocked ? "active" : ""
            }`}
            onClick={lockCabinet}
            disabled={!firebaseReady}
          >
            <Lock size={39} strokeWidth={2.2} />
            <strong>LOCK</strong>
            <span>({isLocked ? "ON" : "OFF"})</span>
          </button>
        </div>

        <div className="info-list">
          <InfoCard
            icon={<Clock3 size={26} />}
            iconClass="green"
            label="Next Dose"
            value={nextDose}
          />

          <InfoCard
            icon={<DoorClosed size={26} />}
            iconClass="blue"
            label="Cabinet Status"
            value={cabinetStatus}
            valueClass={cabinetStatus === "CLOSED" ? "success" : ""}
          />

          <InfoCard
            icon={<CalendarDays size={26} />}
            iconClass="green"
            label="Last Opened"
            value={lastOpened}
          />
        </div>
      </section>
    </main>
  );
}

function InfoCard({
  icon,
  iconClass,
  label,
  value,
  valueClass = "",
}) {
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
