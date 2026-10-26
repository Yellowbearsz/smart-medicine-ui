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
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [newMedicineName, setNewMedicineName] = useState("");
  const [screen, setScreen] = useState("home");
  const [newTime, setNewTime] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [editingTime, setEditingTime] = useState("");
  const [editingMedicineIds, setEditingMedicineIds] = useState([]);
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
              medicineIds: item?.medicineIds || null,
              medicines: Array.isArray(item?.medicines)
                ? item.medicines
                : [],
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

  const addSelectedMedicine = () => {
    if (!selectedMedicineId) {
      setScheduleMessage(
        "ยังไม่มียาใน Dropdown กรุณาพิมพ์ชื่อยาใหม่แล้วกด + เพิ่มยา ก่อน"
      );
      return;
    }

    if (selectedMedicineIds.includes(selectedMedicineId)) {
      setScheduleMessage("ยานี้ถูกเพิ่มแล้ว");
      return;
    }

    setSelectedMedicineIds((current) => [
      ...current,
      selectedMedicineId,
    ]);

    setScheduleMessage("");
  };

  const removeSelectedMedicine = (medicineId) => {
    setSelectedMedicineIds((current) =>
      current.filter((id) => id !== medicineId)
    );
  };

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

    const selectedMedicines =
      medicines.filter(
        (item) => selectedMedicineIds.includes(item.id)
      );

    if (selectedMedicines.length === 0) {
      setScheduleMessage("กรุณาเพิ่มยาอย่างน้อย 1 รายการ");
      return;
    }

    const medicineNames =
      selectedMedicines.map((item) => item.name);

    const medicineIdsObject =
      selectedMedicines.reduce(
        (acc, item) => {
          acc[item.id] = true;
          return acc;
        },
        {}
      );

    try {
      await set(
        ref(db, `smartMedicineCabinet/schedules/${newId}`),
        {
          medicineIds: medicineIdsObject,
          medicines: medicineNames,
          // เก็บ medicine เป็นข้อความรวม เพื่อให้ ESP32 โค้ดเดิมยังอ่านได้
          medicine: medicineNames.join(", "),
          time: newTime,
          enabled: true,
        }
      );

      setNewTime("");
      setSelectedMedicineIds([]);
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

    // เช็กชื่อซ้ำก่อน
    const existing =
      medicines.find(
        (item) =>
          item.name.trim().toLowerCase()
          === name.toLowerCase()
      );

    if (existing) {
      setSelectedMedicineId(existing.id);

      setSelectedMedicineIds((current) => {
        if (current.includes(existing.id)) {
          return current;
        }

        return [
          ...current,
          existing.id,
        ];
      });

      setNewMedicineName("");
      setScheduleMessage(
        `${existing.name} มีอยู่แล้ว จึงใช้รายการเดิม`
      );
      return;
    }

    // ถ้า Firebase Auth ยังไม่พร้อม
    // ให้ลอง sign in ใหม่ตอนกดเพิ่มยา
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
        setFirebaseReady(true);
      }
    } catch (error) {
      console.error("Firebase auth error:", error);
      setScheduleMessage(
        "เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต"
      );
      return;
    }

    const used =
      new Set(
        medicines.map((item) => item.id)
      );

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
      setScheduleMessage(
        "เพิ่มยาได้สูงสุด 50 รายการ"
      );
      return;
    }

    try {
      await set(
        ref(
          db,
          `smartMedicineCabinet/medicines/${newId}`
        ),
        {
          name,
        }
      );

      // อัปเดต Dropdown ทันที
      // ไม่ต้องรอ onValue ส่งค่ากลับมา
      setMedicines((current) => {
        const alreadyExists =
          current.some(
            (item) => item.id === newId
          );

        if (alreadyExists) {
          return current;
        }

        return [
          ...current,
          {
            id: newId,
            name,
          },
        ].sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "th"
            )
        );
      });

      setSelectedMedicineId(newId);

      setSelectedMedicineIds((current) => {
        if (current.includes(newId)) {
          return current;
        }

        return [
          ...current,
          newId,
        ];
      });

      setNewMedicineName("");

      setScheduleMessage(
        `เพิ่มยา ${name} เรียบร้อย`
      );
    } catch (error) {
      console.error("Add medicine error:", error);

      setScheduleMessage(
        `เพิ่มยาไม่สำเร็จ: ${error?.message || "Firebase error"}`
      );
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
      schedules.some((item) => {
        if (item.medicineId === selected.id) {
          return true;
        }

        if (
          Array.isArray(item.medicineIds)
          && item.medicineIds.includes(selected.id)
        ) {
          return true;
        }

        if (
          item.medicineIds
          && typeof item.medicineIds === "object"
          && item.medicineIds[selected.id]
        ) {
          return true;
        }

        return (
          !item.medicineId
          && !item.medicineIds
          && item.medicine === selected.name
        );
      });

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

  const getMedicineIdsForSchedule = (item) => {
    if (
      item.medicineIds
      && typeof item.medicineIds === "object"
      && !Array.isArray(item.medicineIds)
    ) {
      return Object.keys(item.medicineIds)
        .filter((id) => item.medicineIds[id]);
    }

    if (Array.isArray(item.medicineIds)) {
      return item.medicineIds;
    }

    if (item.medicineId) {
      return [item.medicineId];
    }

    if (Array.isArray(item.medicines)) {
      return medicines
        .filter((medicine) =>
          item.medicines.includes(medicine.name)
        )
        .map((medicine) => medicine.id);
    }

    return medicines
      .filter((medicine) =>
        item.medicine
          ?.split(",")
          .map((name) => name.trim())
          .includes(medicine.name)
      )
      .map((medicine) => medicine.id);
  };

  const startEditSchedule = (item) => {
    setEditingScheduleId(item.id);
    setEditingTime(item.time);
    setEditingMedicineIds(
      getMedicineIdsForSchedule(item)
    );
    setScheduleMessage("");
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId("");
    setEditingTime("");
    setEditingMedicineIds([]);
  };

  const addMedicineToEdit = (medicineId) => {
    if (!medicineId) {
      return;
    }

    setEditingMedicineIds((current) => {
      if (current.includes(medicineId)) {
        return current;
      }

      return [
        ...current,
        medicineId,
      ];
    });
  };

  const removeMedicineFromEdit = (medicineId) => {
    setEditingMedicineIds((current) =>
      current.filter((id) => id !== medicineId)
    );
  };

  const saveEditSchedule = async (item) => {
    const timeRegex =
      /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(editingTime)) {
      setScheduleMessage(
        "กรุณาพิมพ์เวลาแบบ HH:MM เช่น 08:30"
      );
      return;
    }

    if (editingMedicineIds.length === 0) {
      setScheduleMessage(
        "กรุณาเลือกยาอย่างน้อย 1 รายการ"
      );
      return;
    }

    const selectedMedicines =
      medicines.filter((medicine) =>
        editingMedicineIds.includes(
          medicine.id
        )
      );

    const medicineNames =
      selectedMedicines.map(
        (medicine) => medicine.name
      );

    const medicineIdsObject =
      selectedMedicines.reduce(
        (acc, medicine) => {
          acc[medicine.id] = true;
          return acc;
        },
        {}
      );

    try {
      await update(
        ref(
          db,
          `smartMedicineCabinet/schedules/${item.id}`
        ),
        {
          time: editingTime,
          medicineIds: medicineIdsObject,
          medicines: medicineNames,
          medicine: medicineNames.join(", "),
          medicineId:
            selectedMedicines.length === 1
              ? selectedMedicines[0].id
              : "",
        }
      );

      setEditingScheduleId("");
      setEditingTime("");
      setEditingMedicineIds([]);

      setScheduleMessage(
        "แก้ไขยาและเวลาเรียบร้อย"
      );
    } catch (error) {
      console.error(error);
      setScheduleMessage(
        "แก้ไขรายการไม่สำเร็จ"
      );
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

  // หน้าแรกแสดงเฉพาะ "เวลาถัดไป" เพียง 1 เวลา
  const nextSchedule =
    upcomingDoses.length > 0
      ? upcomingDoses[0]
      : null;

  // รายการยาของเวลาถัดไป
  const nextScheduleMedicines =
    nextSchedule
      ? (
          nextSchedule.medicines?.length
            ? nextSchedule.medicines
            : (nextSchedule.medicine || "")
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
        )
      : [];

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
                onClick={() => setScreen("medicineList")}
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

                  {!nextSchedule ? (
                    <div className="info-value">
                      ยังไม่มีรายการยา
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "15px",
                          fontWeight: 800,
                          lineHeight: "1.4",
                        }}
                      >
                        เวลาที่ตั้ง : {nextSchedule.time}
                      </div>

                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "14px",
                          fontWeight: 700,
                        }}
                      >
                        รายการยา
                      </div>

                      {nextScheduleMedicines
                        .slice(0, 2)
                        .map((medicine, index) => (
                          <div
                            key={`${medicine}-${index}`}
                            style={{
                              marginTop: "2px",
                              paddingLeft: "18px",
                              fontSize: "14px",
                              fontWeight: 600,
                              lineHeight: "1.4",
                            }}
                          >
                            {index + 1}. {medicine}
                          </div>
                        ))}

                      {nextScheduleMedicines.length > 2 && (
                        <div
                          style={{
                            marginTop: "4px",
                            paddingLeft: "18px",
                            fontSize: "13px",
                            color: "#6b7280",
                            fontWeight: 600,
                          }}
                        >
                          อีก {nextScheduleMedicines.length - 2} รายการ
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
        ) : screen === "medicineList" ? (
          <div style={{ marginTop: "22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
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
                  padding: 0,
                }}
              >
                <ArrowLeft size={20} />
                กลับหน้าหลัก
              </button>

              <button
                type="button"
                onClick={() => setScreen("schedules")}
                style={{
                  border: 0,
                  borderRadius: "10px",
                  padding: "9px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontWeight: 800,
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={18} />
                เพิ่มการแจ้งเตือน
              </button>
            </div>

            <div
              style={{
                fontWeight: 800,
                fontSize: "20px",
                marginBottom: "14px",
              }}
            >
              รายการยาที่ต้องกิน
            </div>

            {schedules.filter((item) => item.enabled).length === 0 ? (
              <div className="info-card">
                <div className="info-icon green">
                  <Clock3 size={24} />
                </div>

                <div className="info-text">
                  <div className="info-label">
                    ยังไม่มีรายการยา
                  </div>

                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "13px",
                      color: "#6b7280",
                    }}
                  >
                    กด “เพิ่มการแจ้งเตือน” เพื่อเพิ่มยาและเวลา
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  maxHeight: "470px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {schedules
                  .filter((item) => item.enabled)
                  .map((item) => {
                    const medicineList =
                      item.medicines?.length
                        ? item.medicines
                        : (item.medicine || "")
                            .split(",")
                            .map((name) => name.trim())
                            .filter(Boolean);

                    return (
                      <div
                        key={item.id}
                        className="info-card"
                        style={{
                          alignItems: "flex-start",
                          padding: "16px",
                        }}
                      >
                        <div className="info-icon green">
                          <Clock3 size={24} />
                        </div>

                        <div
                          className="info-text"
                          style={{ flex: 1 }}
                        >
                          <div
                            style={{
                              fontSize: "16px",
                              fontWeight: 800,
                              marginBottom: "8px",
                            }}
                          >
                            เวลาแจ้งเตือน : {item.time}
                          </div>

                          <div
                            className="info-label"
                            style={{
                              marginBottom: "5px",
                            }}
                          >
                            รายการยา
                          </div>

                          {medicineList.map(
                            (medicine, index) => (
                              <div
                                key={`${item.id}-${medicine}-${index}`}
                                style={{
                                  paddingLeft: "12px",
                                  marginTop: "3px",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  lineHeight: "1.5",
                                }}
                              >
                                {index + 1}. {medicine}
                              </div>
                            )
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                              marginTop: "12px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                startEditSchedule(item);
                                setScreen("schedules");
                              }}
                              style={{
                                border: "1px solid #2563eb",
                                borderRadius: "8px",
                                padding: "7px 10px",
                                background: "#fff",
                                color: "#2563eb",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              EDIT
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleSchedule(item)}
                              style={{
                                border: 0,
                                borderRadius: "999px",
                                padding: "7px 10px",
                                background: item.enabled
                                  ? "#dcfce7"
                                  : "#eceff3",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              {item.enabled ? "ON" : "OFF"}
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteSchedule(item)}
                              aria-label={`Delete ${item.time}`}
                              style={{
                                border: "1px solid #ef4444",
                                borderRadius: "8px",
                                padding: "7px 10px",
                                background: "#fff",
                                color: "#dc2626",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              ลบ
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              marginTop: "22px",
              display: "flex",
              flexDirection: "column",
              height: "570px",
              minHeight: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setScreen("medicineList")}
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
              กลับรายการยา
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
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    value={selectedMedicineId}
                    onChange={(e) => {
                      const id = e.target.value;

                      setSelectedMedicineId(id);

                      const selected =
                        medicines.find(
                          (item) => item.id === id
                        );

                      setNewMedicineName(
                        selected?.name || ""
                      );

                      if (id) {
                        setSelectedMedicineIds(
                          (current) => {
                            if (
                              current.includes(id)
                            ) {
                              return current;
                            }

                            return [
                              ...current,
                              id,
                            ];
                          }
                        );
                      }
                    }}
                    style={{
                      flex: "1 1 160px",
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
                    title="ลบยานี้ออกจาก Dropdown"
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

                {selectedMedicineIds.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "7px",
                      marginBottom: "12px",
                    }}
                  >
                    {selectedMedicineIds.map((id) => {
                      const medicine =
                        medicines.find(
                          (item) => item.id === id
                        );

                      if (!medicine) {
                        return null;
                      }

                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "7px 9px",
                            borderRadius: "999px",
                            background: "#e8f5ec",
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          <span>{medicine.name}</span>

                          <button
                            type="button"
                            onClick={() =>
                              removeSelectedMedicine(id)
                            }
                            aria-label={`เอา ${medicine.name} ออกจากรายการ`}
                            style={{
                              border: 0,
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: "16px",
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

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
                    title="เพิ่มยาเข้า Dropdown และรายการของเวลานี้"
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

            <div
              style={{
                marginTop: "14px",
                display: "grid",
                gap: "10px",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: "4px",
                paddingBottom: "4px",
                alignContent: "start",
              }}
            >
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
                      gap: "10px",
                      flexWrap: "nowrap",
                    }}
                  >
                    <div className="info-icon green">
                      <Clock3 size={24} />
                    </div>

                    <div
                      className="info-text"
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {editingScheduleId === item.id ? (
                        <>
                          <div
                            className="info-label"
                            style={{ marginBottom: "7px" }}
                          >
                            แก้ไขยา
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                              flexWrap: "wrap",
                              marginBottom: "8px",
                            }}
                          >
                            {editingMedicineIds.map((id) => {
                              const medicine =
                                medicines.find(
                                  (m) => m.id === id
                                );

                              if (!medicine) {
                                return null;
                              }

                              return (
                                <div
                                  key={id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    padding: "6px 8px",
                                    borderRadius: "999px",
                                    background: "#e8f5ec",
                                    fontSize: "13px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <span>{medicine.name}</span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeMedicineFromEdit(id)
                                    }
                                    style={{
                                      border: 0,
                                      background: "transparent",
                                      cursor: "pointer",
                                      padding: 0,
                                      fontSize: "16px",
                                      lineHeight: 1,
                                    }}
                                    aria-label={`เอา ${medicine.name} ออกจากรายการ`}
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          <select
                            value=""
                            onChange={(e) => {
                              addMedicineToEdit(
                                e.target.value
                              );
                              e.target.value = "";
                            }}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "8px 10px",
                              marginBottom: "8px",
                              border: "1px solid #d7dce3",
                              borderRadius: "8px",
                              background: "#fff",
                            }}
                          >
                            <option value="">
                              + เพิ่มยาในรายการนี้
                            </option>

                            {medicines
                              .filter(
                                (medicine) =>
                                  !editingMedicineIds.includes(
                                    medicine.id
                                  )
                              )
                              .map((medicine) => (
                                <option
                                  key={medicine.id}
                                  value={medicine.id}
                                >
                                  {medicine.name}
                                </option>
                              ))}
                          </select>

                          <div
                            className="info-label"
                            style={{ marginBottom: "4px" }}
                          >
                            แก้ไขเวลา
                          </div>

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
                            style={{
                              width: "100px",
                              boxSizing: "border-box",
                              padding: "7px 8px",
                              border: "1px solid #cfd5dc",
                              borderRadius: "8px",
                              fontSize: "16px",
                              fontWeight: 700,
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <div className="info-label">
                            {item.medicines?.length
                              ? item.medicines.join(" + ")
                              : item.medicine}
                          </div>

                          <div className="info-value">
                            {item.time}
                          </div>
                        </>
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
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "7px",
                          flexShrink: 0,
                        }}
                      >
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
                            minWidth: "58px",
                          }}
                        >
                          EDIT
                        </button>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleSchedule(item)
                            }
                            style={{
                              border: 0,
                              borderRadius: "999px",
                              padding: "7px 10px",
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
                              padding: "5px",
                            }}
                          >
                            <Trash2 size={19} />
                          </button>
                        </div>
                      </div>
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
