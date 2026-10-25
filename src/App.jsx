import React, { useEffect, useState } from "react";
import { Lock, LockOpen, Clock3, DoorClosed, CalendarDays, PillBottle, ArrowLeft, Plus, Trash2, ChevronRight } from "lucide-react";
import { ref, onValue, set, update, remove } from "firebase/database";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "./firebase";

const OFFLINE_AFTER_SECONDS = 30;

export default function App() {
  const [onlineFlag, setOnlineFlag] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastSeenEpoch, setLastSeenEpoch] = useState(0);
  const [isLocked, setIsLocked] = useState(true);
  const [nextDose, setNextDose] = useState("--:--");
  const [schedules, setSchedules] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [newMedicineName, setNewMedicineName] = useState("");
  const [screen, setScreen] = useState("home");
  const [newTime, setNewTime] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [editingTime, setEditingTime] = useState("");
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
          setCabinetStatus(data.doorStatus || "-");
          setLastOpened(data.lastOpened || "-");
        });

        const schedulesRef = ref(db, "smartMedicineCabinet/schedules");
        const unsubscribeSchedules = onValue(schedulesRef, (snapshot) => {
          const raw = snapshot.val() || {};

          const list = Object.entries(raw)
            .map(([id, item]) => ({
              id,
              medicine: item?.medicine || "Medicine",
              medicineId: item?.medicineId || "",
              time: item?.time || "--:--",
              enabled: item?.enabled === true,
            }))
            .filter((item) => /^\d{2}:\d{2}$/.test(item.time))
            .sort((a, b) => a.time.localeCompare(b.time));

          setSchedules(list);
        });

        const medicinesRef = ref(db, "smartMedicineCabinet/medicines");
        const unsubscribeMedicines = onValue(medicinesRef, (snapshot) => {
          const raw = snapshot.val() || {};

          const list = Object.entries(raw)
            .map(([id, item]) => ({
              id,
              name: typeof item === "string"
                ? item
                : (item?.name || ""),
            }))
            .filter((item) => item.name.trim() !== "")
            .sort((a, b) => a.name.localeCompare(b.name, "th"));

          setMedicines(list);

          setSelectedMedicineId((current) => {
            if (
              current &&
              list.some((item) => item.id === current)
            ) {
              return current;
            }

            return list[0]?.id || "";
          });
        });

        const oldUnsubscribe = unsubscribe;
        unsubscribe = () => {
          if (oldUnsubscribe) oldUnsubscribe();
          unsubscribeSchedules();
          unsubscribeMedicines();
        };
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

  const getNextDose = (items) => {
    const enabled = items.filter((item) => item.enabled);

    if (enabled.length === 0) {
      return "--:--";
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let best = null;

    enabled.forEach((item) => {
      const [h, m] = item.time.split(":").map(Number);
      const minutes = h * 60 + m;
      let delta = minutes - nowMinutes;

      if (delta < 0) {
        delta += 24 * 60;
      }

      if (!best || delta < best.delta) {
        best = { ...item, delta };
      }
    });

    return best ? best.time : "--:--";
  };

  useEffect(() => {
    setNextDose(getNextDose(schedules));

    const timer = setInterval(() => {
      setNextDose(getNextDose(schedules));
    }, 30000);

    return () => clearInterval(timer);
  }, [schedules]);

  const addSchedule = async () => {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(newTime)) {
      setScheduleMessage("กรุณาพิมพ์เวลาแบบ HH:MM เช่น 08:30");
      return;
    }

    const used = new Set(schedules.map((item) => item.id));
    let newId = "";

    for (let i = 1; i <= 10; i += 1) {
      const candidate = `schedule${String(i).padStart(3, "0")}`;
      if (!used.has(candidate)) {
        newId = candidate;
        break;
      }
    }

    if (!newId) {
      setScheduleMessage("ตั้งเวลาได้สูงสุด 10 รายการ");
      return;
    }

    const selectedMedicine =
      medicines.find(
        (item) => item.id === selectedMedicineId
      );

    if (!selectedMedicine) {
      setScheduleMessage("กรุณาเพิ่มและเลือกยาก่อน");
      return;
    }

    try {
      await set(
        ref(db, `smartMedicineCabinet/schedules/${newId}`),
        {
          medicineId: selectedMedicine.id,
          medicine: selectedMedicine.name,
          time: newTime,
          enabled: true,
        }
      );

      setNewTime("");
      setScheduleMessage("เพิ่มเวลาเรียบร้อย");
    } catch (error) {
      console.error(error);
      setScheduleMessage("บันทึกเวลาไม่สำเร็จ");
    }
  };

  const addMedicine = async () => {
    const name = newMedicineName.trim();

    if (!name) {
      setScheduleMessage("กรุณาพิมพ์ชื่อยา");
      return;
    }

    const duplicate =
      medicines.some(
        (item) =>
          item.name.trim().toLowerCase()
          === name.toLowerCase()
      );

    if (duplicate) {
      setScheduleMessage("มียานี้อยู่ในรายการแล้ว");
      return;
    }

    const used = new Set(medicines.map((item) => item.id));
    let newId = "";

    for (let i = 1; i <= 50; i += 1) {
      const candidate =
        `medicine${String(i).padStart(3, "0")}`;

      if (!used.has(candidate)) {
        newId = candidate;
        break;
      }
    }

    if (!newId) {
      setScheduleMessage("เพิ่มยาได้สูงสุด 50 รายการ");
      return;
    }

    try {
      await set(
        ref(db, `smartMedicineCabinet/medicines/${newId}`),
        { name }
      );

      setSelectedMedicineId(newId);
      setNewMedicineName("");
      setScheduleMessage(`เพิ่มยา ${name} เรียบร้อย`);
    } catch (error) {
      console.error(error);
      setScheduleMessage("เพิ่มยาไม่สำเร็จ");
    }
  };

  const deleteMedicine = async () => {
    const selected =
      medicines.find(
        (item) => item.id === selectedMedicineId
      );

    if (!selected) {
      setScheduleMessage("ยังไม่ได้เลือกยา");
      return;
    }

    const usedBySchedule =
      schedules.some(
        (item) =>
          item.medicineId === selected.id
          || (
            !item.medicineId
            && item.medicine === selected.name
          )
      );

    if (usedBySchedule) {
      setScheduleMessage(
        `ลบ ${selected.name} ไม่ได้ เพราะยังถูกใช้ในตารางเวลา`
      );
      return;
    }

    try {
      await remove(
        ref(
          db,
          `smartMedicineCabinet/medicines/${selected.id}`
        )
      );

      setScheduleMessage(
        `ลบยา ${selected.name} เรียบร้อย`
      );
    } catch (error) {
      console.error(error);
      setScheduleMessage("ลบยาไม่สำเร็จ");
    }
  };

  const startEditSchedule = (item) => {
    setEditingScheduleId(item.id);
    setEditingTime(item.time);
    setScheduleMessage("");
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId("");
    setEditingTime("");
  };

  const saveEditSchedule = async (item) => {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(editingTime)) {
      setScheduleMessage(
        "กรุณาพิมพ์เวลาแบบ HH:MM เช่น 08:30"
      );
      return;
    }

    try {
      await update(
        ref(
          db,
          `smartMedicineCabinet/schedules/${item.id}`
        ),
        {
          time: editingTime,
        }
      );

      setEditingScheduleId("");
      setEditingTime("");
      setScheduleMessage(
        `แก้เวลาเป็น ${editingTime} เรียบร้อย`
      );
    } catch (error) {
      console.error(error);
      setScheduleMessage("แก้เวลาไม่สำเร็จ");
    }
  };

  const toggleSchedule = async (item) => {
    await update(
      ref(db, `smartMedicineCabinet/schedules/${item.id}`),
      { enabled: !item.enabled }
    );
  };

  const deleteSchedule = async (item) => {
    await remove(
      ref(db, `smartMedicineCabinet/schedules/${item.id}`)
    );
  };


  const getUpcomingDoses = (items) => {
    const enabled = items.filter((item) => item.enabled);

    if (enabled.length === 0) {
      return [];
    }

    const now = new Date();
    const nowMinutes =
      now.getHours() * 60 + now.getMinutes();

    return enabled
      .map((item) => {
        const [h, m] =
          item.time.split(":").map(Number);

        const minutes = h * 60 + m;

        let delta =
          minutes - nowMinutes;

        if (delta < 0) {
          delta += 24 * 60;
        }

        return {
          ...item,
          delta,
        };
      })
      .sort((a, b) => a.delta - b.delta);
  };

  const upcomingDoses =
    getUpcomingDoses(schedules);

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

        {screen === "home" ? (
          <>
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
              <button
                type="button"
                className="info-card"
                onClick={() => setScreen("schedules")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid #dde2e8",
                  background: "#fff",
                }}
              >
                <div className="info-icon green">
                  <Clock3 size={26} />
                </div>

                <div
                  className="info-text"
                  style={{ flex: 1 }}
                >
                  <div className="info-label">
                    Next Dose
                  </div>

                  {upcomingDoses.length === 0 ? (
                    <div className="info-value">
                      ยังไม่มีรายการยา
                    </div>
                  ) : (
                    <>
                      {upcomingDoses
                        .slice(0, 2)
                        .map((item) => (
                          <div
                            key={item.id}
                            style={{
                              marginTop: "4px",
                              fontSize: "15px",
                              fontWeight: 700,
                              lineHeight: "1.4",
                            }}
                          >
                            {item.medicine} - {item.time}
                          </div>
                        ))}

                      {upcomingDoses.length > 2 && (
                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "13px",
                            color: "#6b7280",
                            fontWeight: 600,
                          }}
                        >
                          + อีก {upcomingDoses.length - 2} รายการ
                        </div>
                      )}
                    </>
                  )}
                </div>

                <ChevronRight size={22} />
              </button>

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
          </>
        ) : (
          <div style={{ marginTop: "22px" }}>
            <button
              type="button"
              onClick={() => setScreen("home")}
              style={{
                border: 0,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: "14px",
              }}
            >
              <ArrowLeft size={20} />
              กลับหน้าหลัก
            </button>

            <div
              className="info-card"
              style={{
                display: "block",
                padding: "18px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px", marginBottom: "4px" }}>
                ตั้งเวลาแจ้งเตือน
              </div>
              <div style={{ fontSize: "13px", opacity: 0.7, marginBottom: "14px" }}>
                พิมพ์เวลาแบบ 24 ชั่วโมง เช่น 08:30 หรือ 21:15
              </div>

              <div
                style={{
                  marginBottom: "14px",
                  padding: "12px",
                  border: "1px solid #e1e5ea",
                  borderRadius: "12px",
                  background: "#fafbfc",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: "8px",
                  }}
                >
                  เลือกยา
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <select
                    value={selectedMedicineId}
                    onChange={(e) =>
                      setSelectedMedicineId(e.target.value)
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "11px 12px",
                      border: "1px solid #d7dce3",
                      borderRadius: "10px",
                      fontSize: "16px",
                      background: "#fff",
                    }}
                  >
                    {medicines.length === 0 ? (
                      <option value="">
                        -- ยังไม่มียา --
                      </option>
                    ) : (
                      medicines.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.name}
                        </option>
                      ))
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={deleteMedicine}
                    disabled={!selectedMedicineId}
                    title="ลบยาที่เลือก"
                    style={{
                      border: "1px solid #ef4444",
                      borderRadius: "10px",
                      padding: "9px 11px",
                      background: "#fff",
                      color: "#dc2626",
                      cursor: selectedMedicineId
                        ? "pointer"
                        : "not-allowed",
                    }}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <input
                    type="text"
                    value={newMedicineName}
                    onChange={(e) =>
                      setNewMedicineName(e.target.value)
                    }
                    placeholder="พิมพ์ชื่อยาใหม่"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "11px 12px",
                      border: "1px solid #d7dce3",
                      borderRadius: "10px",
                      fontSize: "16px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={addMedicine}
                    disabled={!firebaseReady}
                    style={{
                      border: 0,
                      borderRadius: "10px",
                      padding: "10px 13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontWeight: 800,
                      background: "#2563eb",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={19} />
                    เพิ่มยา
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={newTime}
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^0-9:]/g, "");
                    if (value.length === 2 && !value.includes(":") && newTime.length < value.length) {
                      value += ":";
                    }
                    setNewTime(value.slice(0, 5));
                  }}
                  placeholder="HH:MM"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "11px 12px",
                    border: "1px solid #d7dce3",
                    borderRadius: "10px",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                />

                <button
                  type="button"
                  onClick={addSchedule}
                  disabled={!firebaseReady}
                  style={{
                    border: 0,
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontWeight: 800,
                    background: "#20b85a",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={20} />
                  ADD
                </button>
              </div>

              {scheduleMessage && (
                <div style={{ marginTop: "9px", fontSize: "13px" }}>
                  {scheduleMessage}
                </div>
              )}
            </div>

            <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
              {schedules.length === 0 ? (
                <div className="info-card">
                  <div className="info-text">
                    <div className="info-label">ยังไม่มีเวลาที่ตั้งไว้</div>
                  </div>
                </div>
              ) : (
                schedules.map((item) => (
                  <div
                    key={item.id}
                    className="info-card"
                    style={{
                      opacity: item.enabled ? 1 : 0.55,
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div className="info-icon green">
                      <Clock3 size={24} />
                    </div>

                    <div
                      className="info-text"
                      style={{
                        flex: 1,
                        minWidth: "120px",
                      }}
                    >
                      <div className="info-label">
                        {item.medicine}
                      </div>

                      {editingScheduleId === item.id ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={editingTime}
                          onChange={(e) => {
                            let value =
                              e.target.value.replace(
                                /[^0-9:]/g,
                                ""
                              );

                            if (
                              value.length === 2
                              &&
                              !value.includes(":")
                              &&
                              editingTime.length
                                < value.length
                            ) {
                              value += ":";
                            }

                            setEditingTime(
                              value.slice(0, 5)
                            );
                          }}
                          placeholder="HH:MM"
                          autoFocus
                          style={{
                            marginTop: "4px",
                            width: "92px",
                            boxSizing: "border-box",
                            padding: "7px 8px",
                            border: "1px solid #cfd5dc",
                            borderRadius: "8px",
                            fontSize: "16px",
                            fontWeight: 700,
                          }}
                        />
                      ) : (
                        <div className="info-value">
                          {item.time}
                        </div>
                      )}
                    </div>

                    {editingScheduleId === item.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            saveEditSchedule(item)
                          }
                          style={{
                            border: 0,
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "#20b85a",
                            color: "#fff",
                          }}
                        >
                          SAVE
                        </button>

                        <button
                          type="button"
                          onClick={cancelEditSchedule}
                          style={{
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "#fff",
                          }}
                        >
                          CANCEL
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            startEditSchedule(item)
                          }
                          style={{
                            border: "1px solid #2563eb",
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "#fff",
                            color: "#2563eb",
                          }}
                        >
                          EDIT
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            toggleSchedule(item)
                          }
                          style={{
                            border: 0,
                            borderRadius: "999px",
                            padding: "8px 10px",
                            fontWeight: 800,
                            cursor: "pointer",
                            background:
                              item.enabled
                                ? "#dcfce7"
                                : "#eceff3",
                          }}
                        >
                          {item.enabled ? "ON" : "OFF"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteSchedule(item)
                          }
                          aria-label={`Delete ${item.time}`}
                          style={{
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            padding: "7px",
                          }}
                        >
                          <Trash2 size={20} />
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
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
