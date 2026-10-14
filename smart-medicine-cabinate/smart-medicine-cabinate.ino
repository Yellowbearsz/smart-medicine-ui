#include <WiFi.h>
#include <Wire.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ThreeWire.h>
#include <RtcDS1302.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"

// =====================================================
// WIFI

// =====================================================
const char* WIFI_SSID_1 = "ArmKodWai";
const char* WIFI_PASSWORD_1 = "0834764734Arm";

const char* WIFI_SSID_2 = "PSRU Next WiFi";
const char* WIFI_PASSWORD_2 = "";

// =====================================================
// FIREBASE

// =====================================================
#define API_KEY "AIzaSyBUOUDJaobn-WYzFa_m0aaK32WjTx-6Rvg"
#define DATABASE_URL "https://smart-medicine-cabinet-e7c26-default-rtdb.asia-southeast1.firebasedatabase.app/"

// =====================================================
// PIN

// =====================================================
#define REED_PIN    27
#define SERVO_PIN   26
#define BUZZER_PIN  25
#define SDA_PIN     21
#define SCL_PIN     22

// =====================================================
// OLED

// =====================================================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  OLED_RESET
);
bool oledReady = false;

// =====================================================
// =====================================================
// RTC DS1302
// =====================================================

#define RTC_CLK 18
#define RTC_DAT 19
#define RTC_RST 23

ThreeWire myWire(
  RTC_DAT,
  RTC_CLK,
  RTC_RST
);

RtcDS1302<ThreeWire> rtc(myWire);

bool rtcReady = false;

// =====================================================
// SERVO

// =====================================================
Servo lockServo;
const int LOCK_ANGLE = 0;
const int UNLOCK_ANGLE = 90;
bool isLocked = true;

// =====================================================
// FIREBASE

// =====================================================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool signupOK = false;

// =====================================================
// DATABASE PATH

// =====================================================
String basePath =
  "/smartMedicineCabinet";
String devicePath =
  basePath + "/device/cabinet01";
String commandPath =
  basePath + "/commands/cabinet01";
String schedulePath =
  basePath + "/schedules/schedule001";
String configPath =
  basePath + "/config";

// =====================================================
// MEDICINE DATA

// =====================================================
String medicineName = "Vitamin C";
String medicineTime = "12:00";
bool scheduleEnabled = true;

// =====================================================
// STATUS

// =====================================================
bool lastDoorState = false;
bool medicineAlarm = false;

// =====================================================
// TIMER

// =====================================================
unsigned long lastFirebaseRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastScheduleRead = 0;
const unsigned long FIREBASE_INTERVAL = 700;
const unsigned long HEARTBEAT_INTERVAL = 10000;
const unsigned long SCHEDULE_INTERVAL = 10000;

// =====================================================
// PREVENT DUPLICATE ALARM

// =====================================================
String lastAlarmDate = "";
String lastAlarmTime = "";

// =====================================================
// SETUP

// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("==========================");
  Serial.println("SMART MEDICINE CABINET");
  Serial.println("==========================");
  // ------------------------------
  // GPIO
  // ------------------------------
  pinMode(
    REED_PIN,
    INPUT_PULLUP
  );
  pinMode(
    BUZZER_PIN,
    OUTPUT
  );
  digitalWrite(
    BUZZER_PIN,
    LOW
  );
  // ------------------------------
  // I2C
  // ------------------------------
  Wire.begin(
    SDA_PIN,
    SCL_PIN
  );
  // ------------------------------
  // OLED
  // ------------------------------
  oledReady =
    display.begin(
      SSD1306_SWITCHCAPVCC,
      0x3C
    );
  if (oledReady) {
    showOLED(
      "Smart Medicine",
      "Starting..."
    );
  } else {
    Serial.println(
      "OLED not found"
    );
  }
  // ------------------------------
  // RTC
  // ------------------------------
rtc.Begin();
rtcReady = true;

if (rtc.GetIsWriteProtected()) {
  rtc.SetIsWriteProtected(false);
}

if (!rtc.GetIsRunning()) {
  rtc.SetIsRunning(true);
}

RtcDateTime compiled =
  RtcDateTime(__DATE__, __TIME__);

if (!rtc.IsDateTimeValid()) {
  Serial.println("RTC time invalid, setting time...");
  rtc.SetDateTime(compiled);
}

rtcReady = rtc.IsDateTimeValid();

if (rtcReady) {
  Serial.println("RTC DS1302 OK");
} else {
  Serial.println("RTC DS1302 ERROR");
}
  // ------------------------------
  // SERVO
  // ------------------------------
  lockServo.setPeriodHertz(50);
  lockServo.attach(
    SERVO_PIN,
    500,
    2400
  );
  lockServo.write(
    LOCK_ANGLE
  );
  isLocked = true;
  // ------------------------------
  // WIFI
  // ------------------------------
  connectWiFi();
  // Sync Internet time for heartbeat
  syncInternetTime();
  // ------------------------------
  // FIREBASE
  // ------------------------------
  setupFirebase();
  // ------------------------------
  // CREATE DATABASE
  // ------------------------------
  waitFirebaseReady();
  if (
    Firebase.ready()
    &&
    signupOK
  ) {
    checkAndCreateDatabase();
    // ESP32 Online
    updateDeviceOnline(true);
    // โหลดตารางยา
    readSchedule();
    // อ่านคำสั่งล็อก
    readLockCommand();
  }
  // ------------------------------
  // INITIAL DOOR STATUS
  // ------------------------------
  lastDoorState =
    digitalRead(REED_PIN);
  updateDoorStatus(
    lastDoorState
  );
  showStatus();
}

// =====================================================
// LOOP

// =====================================================
void loop() {
  // ตรวจประตู
  checkDoor();
  // ตรวจเวลากินยา
  checkMedicineTime();
  if (
    Firebase.ready()
    &&
    signupOK
  ) {
    // -----------------------------------
    // COMMAND
    // -----------------------------------
    if (
      millis() - lastFirebaseRead
      >= FIREBASE_INTERVAL
    ) {
      lastFirebaseRead =
        millis();
      readLockCommand();
    }
    // -----------------------------------
    // SCHEDULE
    // -----------------------------------
    if (
      millis() - lastScheduleRead
      >= SCHEDULE_INTERVAL
    ) {
      lastScheduleRead =
        millis();
      readSchedule();
    }
    // -----------------------------------
    // HEARTBEAT
    // -----------------------------------
    if (
      millis() - lastHeartbeat
      >= HEARTBEAT_INTERVAL
    ) {
      lastHeartbeat =
        millis();
      updateDeviceOnline(true);
    }
  }
  delay(50);
}

// =====================================================
// WIFI

// =====================================================
void connectWiFi() {

  WiFi.mode(WIFI_STA);

  // =========================
  // WiFi ตัวที่ 1
  // =========================
  Serial.println();
  Serial.println("Trying WiFi 1...");

  WiFi.begin(
    WIFI_SSID_1,
    WIFI_PASSWORD_1
  );

  unsigned long start = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 15000
  ) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi 1 CONNECTED");

    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    return;
  }

  // =========================
  // WiFi ตัวที่ 2
  // =========================
  Serial.println();
  Serial.println("WiFi 1 failed");

  WiFi.disconnect();
  delay(1000);

  WiFi.mode(WIFI_STA);

  Serial.println("Trying WiFi 2...");

  WiFi.begin(
    WIFI_SSID_2,
    WIFI_PASSWORD_2
  );

  start = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 15000
  ) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi 2 CONNECTED");

    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    return;
  }

  Serial.println();
  Serial.println("ALL WIFI FAILED");
}

// =====================================================
// FIREBASE SETUP

// =====================================================
void setupFirebase() {
  config.api_key =
    API_KEY;
  config.database_url =
    DATABASE_URL;
  config.token_status_callback =
    tokenStatusCallback;
  Serial.println(
    "Firebase signing in..."
  );
  if (
    Firebase.signUp(
      &config,
      &auth,
      "",
      ""
    )
  ) {
    signupOK = true;
    Serial.println(
      "Firebase SignUp OK"
    );
  } else {
    signupOK = false;
    Serial.print(
      "Firebase SignUp Error: "
    );
    Serial.println(
      config.signer
        .signupError
        .message
        .c_str()
    );
  }
  Firebase.begin(
    &config,
    &auth
  );
  Firebase.reconnectWiFi(
    true
  );
}

// =====================================================
// WAIT FIREBASE

// =====================================================
void waitFirebaseReady() {
  Serial.print(
    "Waiting Firebase"
  );
  unsigned long start =
    millis();
  while (
    !Firebase.ready()
  ) {
    delay(250);
    Serial.print(".");
    if (
      millis() - start
      > 20000
    ) {
      Serial.println();
      Serial.println(
        "Firebase timeout"
      );
      return;
    }
  }
  Serial.println();
  Serial.println(
    "Firebase Ready"
  );
}

// =====================================================
// CREATE DATABASE AUTOMATICALLY

// =====================================================
void checkAndCreateDatabase() {
  bool initialized = false;
  String initPath =
    configPath + "/initialized";
  // ตรวจว่าฐานข้อมูลเคยสร้างหรือยัง
  if (
    Firebase.RTDB.getBool(
      &fbdo,
      initPath
    )
  ) {
    initialized =
      fbdo.boolData();
  }
  if (initialized) {
    Serial.println(
      "Database already initialized"
    );
    return;
  }
  Serial.println(
    "Creating initial database..."
  );
  createInitialDatabase();
}

// =====================================================
// INITIAL DATABASE

// =====================================================
void createInitialDatabase() {
  FirebaseJson json;
  // --------------------------------------------------
  // DEVICE
  // --------------------------------------------------
  json.set(
    "device/cabinet01/online",
    true
  );
  json.set(
    "device/cabinet01/doorStatus",
    "CLOSED"
  );
  json.set(
    "device/cabinet01/lockStatus",
    "LOCKED"
  );
  json.set(
    "device/cabinet01/nextDose",
    "12:00"
  );
  json.set(
    "device/cabinet01/lastOpened",
    "-"
  );
  json.set(
    "device/cabinet01/doseStatus",
    "NONE"
  );
  json.set(
    "device/cabinet01/takenTime",
    "-"
  );
  // --------------------------------------------------
  // COMMAND
  // --------------------------------------------------
  json.set(
    "commands/cabinet01/lock",
    "LOCK"
  );
  json.set(
    "commands/cabinet01/buzzer",
    "OFF"
  );
  // --------------------------------------------------
  // SCHEDULE
  // --------------------------------------------------
  json.set(
    "schedules/schedule001/medicine",
    "Vitamin C"
  );
  json.set(
    "schedules/schedule001/time",
    "12:00"
  );
  json.set(
    "schedules/schedule001/enabled",
    true
  );
  // --------------------------------------------------
  // CONFIG
  // --------------------------------------------------
  json.set(
    "config/initialized",
    true
  );
  json.set(
    "config/schemaVersion",
    1
  );
  // --------------------------------------------------
  // UPDATE DATABASE
  // --------------------------------------------------
  if (
    Firebase.RTDB.updateNode(
      &fbdo,
      basePath,
      &json
    )
  ) {
    Serial.println(
      "Database created successfully"
    );
  } else {
    Serial.print(
      "Database create error: "
    );
    Serial.println(
      fbdo.errorReason()
    );
  }
}

// =====================================================
// READ LOCK COMMAND

// =====================================================
void readLockCommand() {
  String path =
    commandPath + "/lock";
  if (
    Firebase.RTDB.getString(
      &fbdo,
      path
    )
  ) {
    String command =
      fbdo.stringData();
    command.trim();
    command.toUpperCase();
    if (
      command == "UNLOCK"
      &&
      isLocked
    ) {
      unlockCabinet();
    }
    if (
      command == "LOCK"
      &&
      !isLocked
    ) {
      lockCabinet();
    }
  }
}

// =====================================================
// LOCK

// =====================================================
void lockCabinet() {
  lockServo.write(
    LOCK_ANGLE
  );
  isLocked = true;
  Serial.println(
    "Cabinet LOCKED"
  );
  if (
    Firebase.ready()
  ) {
    Firebase.RTDB.setString(
      &fbdo,
      devicePath
        + "/lockStatus",
      "LOCKED"
    );
  }
  showStatus();
}

// =====================================================
// UNLOCK

// =====================================================
void unlockCabinet() {
  lockServo.write(
    UNLOCK_ANGLE
  );
  isLocked = false;
  Serial.println(
    "Cabinet UNLOCKED"
  );
  if (
    Firebase.ready()
  ) {
    Firebase.RTDB.setString(
      &fbdo,
      devicePath
        + "/lockStatus",
      "UNLOCKED"
    );
  }
  showStatus();
}

// =====================================================
// CHECK DOOR

// =====================================================
void checkDoor() {
  /*
    INPUT_PULLUP + Reed Switch
    LOW  = ประตูปิด
    HIGH = ประตูเปิด
    ถ้าเซนเซอร์ของจริงกลับกัน
    ให้กลับค่าตรงนี้
  */
  bool doorOpen =
    digitalRead(
      REED_PIN
    );
  if (
    doorOpen
    != lastDoorState
  ) {
    delay(30);
    doorOpen =
      digitalRead(
        REED_PIN
      );
    if (
      doorOpen
      != lastDoorState
    ) {
      lastDoorState =
        doorOpen;
      updateDoorStatus(
        doorOpen
      );
      if (doorOpen) {
        Serial.println(
          "Door OPEN"
        );
        saveLastOpened();
        if (
          medicineAlarm
        ) {
          medicineTaken();
        }
      } else {
        Serial.println(
          "Door CLOSED"
        );
      }
      showStatus();
    }
  }
}

// =====================================================
// UPDATE DOOR STATUS

// =====================================================
void updateDoorStatus(
  bool doorOpen
) {
  if (
    !Firebase.ready()
  ) {
    return;
  }
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/doorStatus",
    doorOpen
      ? "OPEN"
      : "CLOSED"
  );
}

// =====================================================
// LAST OPENED

// =====================================================
void saveLastOpened() {
  if (
    !rtcReady
  ) {
    return;
  }
  RtcDateTime now = rtc.GetDateTime();
  String dateTime =
    formatDateTime(
      now
    );
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/lastOpened",
    dateTime
  );
}

// =====================================================
// READ MEDICINE SCHEDULE

// =====================================================
void readSchedule() {
  // -----------------------------------
  // MEDICINE
  // -----------------------------------
  if (
    Firebase.RTDB.getString(
      &fbdo,
      schedulePath
        + "/medicine"
    )
  ) {
    medicineName =
      fbdo.stringData();
  }
  // -----------------------------------
  // TIME
  // -----------------------------------
  if (
    Firebase.RTDB.getString(
      &fbdo,
      schedulePath
        + "/time"
    )
  ) {
    medicineTime =
      fbdo.stringData();
  }
  // -----------------------------------
  // ENABLED
  // -----------------------------------
  if (
    Firebase.RTDB.getBool(
      &fbdo,
      schedulePath
        + "/enabled"
    )
  ) {
    scheduleEnabled =
      fbdo.boolData();
  }
  // -----------------------------------
  // NEXT DOSE
  // -----------------------------------
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/nextDose",
    medicineTime
  );
  Serial.println(
    "----- Schedule -----"
  );
  Serial.print(
    "Medicine: "
  );
  Serial.println(
    medicineName
  );
  Serial.print(
    "Time: "
  );
  Serial.println(
    medicineTime
  );
  Serial.print(
    "Enabled: "
  );
  Serial.println(
    scheduleEnabled
      ? "YES"
      : "NO"
  );
}

// =====================================================
// CHECK MEDICINE TIME

// =====================================================
void checkMedicineTime() {
  if (
    !rtcReady
    ||
    !scheduleEnabled
  ) {
    return;
  }
RtcDateTime now = rtc.GetDateTime();
  String currentTime =
    twoDigit(
      now.Hour()
    )
    + ":"
    + twoDigit(
      now.Minute()
    );
  String currentDate =
    String(
      now.Year()
    )
    + "-"
    + twoDigit(
      now.Month()
    )
    + "-"
    + twoDigit(
      now.Day()
    );
  if (
    currentTime
    == medicineTime
  ) {
    // ป้องกันเตือนซ้ำในนาทีเดียวกัน
    if (
      lastAlarmDate
        != currentDate
      ||
      lastAlarmTime
        != currentTime
    ) {
      lastAlarmDate =
        currentDate;
      lastAlarmTime =
        currentTime;
      startMedicineAlarm();
    }
  }
}

// =====================================================
// START ALARM

// =====================================================
void startMedicineAlarm() {
  medicineAlarm = true;
  Serial.println();
  Serial.println(
    "MEDICINE TIME!"
  );
  digitalWrite(
    BUZZER_PIN,
    HIGH
  );
  // ปลดล็อกตู้เมื่อถึงเวลา
  unlockCabinet();
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/doseStatus",
    "WAITING"
  );
  if (
    oledReady
  ) {
    display.clearDisplay();
    display.setTextColor(
      SSD1306_WHITE
    );
    display.setTextSize(1);
    display.setCursor(
      0,
      5
    );
    display.println(
      "MEDICINE TIME"
    );
    display.println();
    display.println(
      medicineName
    );
    display.print(
      "Time: "
    );
    display.println(
      medicineTime
    );
    display.display();
  }
}

// =====================================================
// MEDICINE TAKEN

// =====================================================
void medicineTaken() {
  medicineAlarm = false;
  digitalWrite(
    BUZZER_PIN,
    LOW
  );
  if (
    !rtcReady
  ) {
    return;
  }
RtcDateTime now = rtc.GetDateTime();
  String taken =
    formatDateTime(
      now
    );
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/doseStatus",
    "TAKEN"
  );
  Firebase.RTDB.setString(
    &fbdo,
    devicePath
      + "/takenTime",
    taken
  );
  saveHistory(
    medicineName,
    medicineTime,
    taken
  );
  Serial.println(
    "Medicine TAKEN"
  );
  showStatus();
}

// =====================================================



// SAVE HISTORY

// =====================================================
void saveHistory(
  String medicine,
  String scheduled,
  String taken
) {
RtcDateTime now = rtc.GetDateTime();
  String id =
    String(
      now.Year()
    )
    + twoDigit(
      now.Month()
    )
    + twoDigit(
      now.Day()
    )
    + "_"
    + twoDigit(
      now.Hour()
    )
    + twoDigit(
      now.Minute()
    )
    + twoDigit(
      now.Second()
    );
  String historyPath =
    basePath
    + "/history/"
    + id;
  FirebaseJson json;
  json.set(
    "medicine",
    medicine
  );
  json.set(
    "scheduledTime",
    scheduled
  );
  json.set(
    "takenTime",
    taken
  );
  json.set(
    "status",
    "TAKEN"
  );
  Firebase.RTDB.setJSON(
    &fbdo,
    historyPath,
    &json
  );
}

// =====================================================
// HEARTBEAT

// =====================================================
void updateDeviceOnline(bool status) {
  Firebase.RTDB.setBool(
    &fbdo,
    devicePath + "/online",
    status
  );
  time_t nowEpoch = time(nullptr);
  if (nowEpoch > 1700000000) {
    Firebase.RTDB.setInt(
      &fbdo,
      devicePath + "/lastSeenEpoch",
      (int)nowEpoch
    );
  }
  if (rtcReady) {
    RtcDateTime now = rtc.GetDateTime();
    Firebase.RTDB.setString(
      &fbdo,
      devicePath + "/lastSeen",
      formatDateTime(now)
    );
  }
}

// =====================================================
// OLED STATUS

// =====================================================
void showStatus() {
  if (
    !oledReady
  ) {
    return;
  }
  display.clearDisplay();
  display.setTextColor(
    SSD1306_WHITE
  );
  display.setTextSize(1);
  display.setCursor(
    0,
    0
  );
  display.println(
    "Smart Medicine"
  );
  display.println(
    "Cabinet"
  );
  display.println();
  display.print(
    "Next: "
  );
  display.println(
    medicineTime
  );
  display.print(
    "Lock: "
  );
  if (
    isLocked
  ) {
    display.println(
      "LOCKED"
    );
  } else {
    display.println(
      "UNLOCK"
    );
  }
  display.print(
    "Door: "
  );
  display.println(
    lastDoorState
      ? "OPEN"
      : "CLOSED"
  );
  display.display();
}

// =====================================================
// OLED MESSAGE

// =====================================================
void showOLED(
  String line1,
  String line2
) {
  if (
    !oledReady
  ) {
    return;
  }
  display.clearDisplay();
  display.setTextColor(
    SSD1306_WHITE
  );
  display.setTextSize(1);
  display.setCursor(
    0,
    10
  );
  display.println(
    line1
  );
  display.println();
  display.println(
    line2
  );
  display.display();
}

// =====================================================
// DATE FORMAT

// =====================================================
String formatDateTime(
  RtcDateTime dt
) {
  return
    String(
      dt.Year()
    )
    + "-"
    + twoDigit(
      dt.Month()
    )
    + "-"
    + twoDigit(
      dt.Day()
    )
    + " "
    + twoDigit(
      dt.Hour()
    )
    + ":"
    + twoDigit(
      dt.Minute()
    )
    + ":"
    + twoDigit(
      dt.Second()
    );
}

// =====================================================
// TWO DIGIT

// =====================================================
void syncInternetTime() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("NTP skipped: WiFi not connected");
    return;
  }
  configTime(
    0,
    0,
    "pool.ntp.org",
    "time.google.com",
    "time.nist.gov"
  );
  Serial.print("Syncing internet time");
  unsigned long start = millis();
  while (time(nullptr) < 1700000000) {
    delay(300);
    Serial.print(".");
    if (millis() - start > 15000) {
      Serial.println();
      Serial.println("NTP sync timeout");
      return;
    }
  }
  Serial.println();
  Serial.println("NTP time synced");
}
String twoDigit(
  int number
) {
  if (
    number < 10
  ) {
    return
      "0"
      + String(
        number
      );
  }
  return String(
    number
  );
}
