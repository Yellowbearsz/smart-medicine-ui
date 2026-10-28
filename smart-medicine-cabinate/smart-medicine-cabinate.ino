#include <WiFi.h>
#include <Wire.h>
#include <ESP32Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ThreeWire.h>
#include <RtcDS1302.h>
#include <Firebase_ESP_Client.h>
#include <time.h>

// ---------- WiFi ----------
const char* SSID[] = {"Ruttanaporn_2.4G","ArmKodWai","PSRU Next WiFi"};
const char* PASS[] = {"Ruttanaporn097","0834764734Arm",""};

// ---------- Firebase ----------
#define API_KEY "AIzaSyBUOUDJaobn-WYzFa_m0aaK32WjTx-6Rvg"
#define DATABASE_URL "https://smart-medicine-cabinet-e7c26-default-rtdb.asia-southeast1.firebasedatabase.app/"

// ---------- Pins ----------
#define SDA_PIN 21
#define SCL_PIN 22
#define RTC_CLK 18
#define RTC_DAT 19
#define RTC_RST 23
#define SERVO_PIN 26
#define REED_PIN 27
#define BUZZER_PIN 25

#define BUZZER_ON LOW
#define BUZZER_OFF HIGH

// LOCK = ตั้งตรง
const int LOCK_ANGLE = 90;
const int UNLOCK_ANGLE = 20;

Servo servo;
Adafruit_SSD1306 display(128,64,&Wire,-1);
ThreeWire rtcWire(RTC_DAT,RTC_CLK,RTC_RST);
RtcDS1302<ThreeWire> rtc(rtcWire);

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

bool firebaseOK=false, oledOK=false, rtcOK=false;
bool isLocked=true, doorOpen=false, lastDoorOpen=false;
bool scheduleEnabled=true, alarmOn=false;

String lastCommand="", medicineName="Vitamin C", medicineTime="12:00";
String lastAlarmDate="", lastAlarmTime="";

unsigned long tCmd=0, tSchedule=0, tHeartbeat=0;

const String BASE="/smartMedicineCabinet";
const String DEVICE=BASE+"/device/cabinet01";
const String COMMAND=BASE+"/commands/cabinet01";
const String SCHEDULE=BASE+"/schedules/schedule001";

String two(int n){ return n<10 ? "0"+String(n) : String(n); }

String nowText(){
  RtcDateTime t=rtc.GetDateTime();
  return String(t.Year())+"-"+two(t.Month())+"-"+two(t.Day())+" "+
         two(t.Hour())+":"+two(t.Minute())+":"+two(t.Second());
}

void showStatus(){
  if(!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0,0);
  display.println("Smart Medicine");
  display.print("Next: "); display.println(medicineTime);
  display.print("Lock: "); display.println(isLocked?"LOCKED":"UNLOCK");
  display.print("Door: "); display.println(doorOpen?"OPEN":"CLOSED");
  display.display();
}

void moveServo(int angle){
  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN,500,2400);
  servo.write(angle);
  delay(700);
  servo.detach();
}

void lockCabinet(){
  if(isLocked) return;
  moveServo(LOCK_ANGLE);
  isLocked=true;
  if(firebaseOK) Firebase.RTDB.setString(&fbdo,DEVICE+"/lockStatus","LOCKED");
  showStatus();
}

void unlockCabinet(){
  if(!isLocked) return;
  moveServo(UNLOCK_ANGLE);
  isLocked=false;
  if(firebaseOK) Firebase.RTDB.setString(&fbdo,DEVICE+"/lockStatus","UNLOCKED");
  showStatus();
}

void connectWiFi(){
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  for(int i=0;i<3 && WiFi.status()!=WL_CONNECTED;i++){
    WiFi.begin(SSID[i],PASS[i]);
    unsigned long s=millis();
    while(WiFi.status()!=WL_CONNECTED && millis()-s<12000) delay(300);
    if(WiFi.status()!=WL_CONNECTED){ WiFi.disconnect(false,false); delay(300); }
  }

  if(WiFi.status()==WL_CONNECTED){
    Serial.println("WiFi OK");
    configTime(0,0,"pool.ntp.org","time.google.com");
    unsigned long s=millis();
    while(time(nullptr)<1700000000 && millis()-s<8000) delay(200);
    Serial.println(time(nullptr)>=1700000000 ? "NTP OK" : "NTP WAIT");
  }else Serial.println("WiFi FAIL");
}

void setupFirebase(){
  config.api_key=API_KEY;
  config.database_url=DATABASE_URL;

  if(!Firebase.signUp(&config,&auth,"","")){
    Serial.println("Firebase SignUp FAIL");
    return;
  }

  Firebase.begin(&config,&auth);
  Firebase.reconnectWiFi(true);

  unsigned long s=millis();
  while(!Firebase.ready() && millis()-s<15000) delay(100);

  firebaseOK=Firebase.ready();
  Serial.println(firebaseOK ? "Firebase OK" : "Firebase FAIL");
}

void heartbeat(){
  if(!firebaseOK) return;

  Firebase.RTDB.setBool(&fbdo,DEVICE+"/online",true);

  time_t e=time(nullptr);
  if(e>=1700000000)
    Firebase.RTDB.setInt(&fbdo,DEVICE+"/lastSeenEpoch",(int)e);

  if(rtcOK)
    Firebase.RTDB.setString(&fbdo,DEVICE+"/lastSeen",nowText());
}

void readLock(){
  if(!Firebase.RTDB.getString(&fbdo,COMMAND+"/lock")) return;

  String cmd=fbdo.stringData();
  cmd.trim(); cmd.toUpperCase();

  if(cmd==lastCommand) return;
  lastCommand=cmd;

  Serial.print("LOCK command = "); Serial.println(cmd);
  if(cmd=="LOCK") lockCabinet();
  else if(cmd=="UNLOCK") unlockCabinet();
}

void readSchedule(){
  if(Firebase.RTDB.getString(&fbdo,SCHEDULE+"/medicine"))
    medicineName=fbdo.stringData();

  if(Firebase.RTDB.getString(&fbdo,SCHEDULE+"/time"))
    medicineTime=fbdo.stringData();

  if(Firebase.RTDB.getBool(&fbdo,SCHEDULE+"/enabled"))
    scheduleEnabled=fbdo.boolData();

  Firebase.RTDB.setString(&fbdo,DEVICE+"/nextDose",medicineTime);
  showStatus();
}

void saveHistory(String status,String eventTime){
  if(!firebaseOK || !rtcOK) return;

  RtcDateTime t=rtc.GetDateTime();
  String id=String(t.Year())+two(t.Month())+two(t.Day())+"_"+
            two(t.Hour())+two(t.Minute())+two(t.Second());

  FirebaseJson j;
  j.set("medicine",medicineName);
  j.set("scheduledTime",medicineTime);
  j.set("eventTime",eventTime);
  j.set("status",status);

  Firebase.RTDB.setJSON(&fbdo,BASE+"/history/"+id,&j);
}

void medicineTaken(){
  alarmOn=false;
  digitalWrite(BUZZER_PIN,BUZZER_OFF);

  String taken=rtcOK ? nowText() : "-";

  if(firebaseOK){
    Firebase.RTDB.setString(&fbdo,DEVICE+"/doseStatus","TAKEN");
    Firebase.RTDB.setString(&fbdo,DEVICE+"/takenTime",taken);
    saveHistory("TAKEN",taken);
  }
  showStatus();
}

void checkDoor(){
  bool s=digitalRead(REED_PIN);
  if(s==lastDoorOpen) return;

  delay(30);
  s=digitalRead(REED_PIN);
  if(s==lastDoorOpen) return;

  doorOpen=lastDoorOpen=s;

  if(firebaseOK){
    Firebase.RTDB.setString(&fbdo,DEVICE+"/doorStatus",doorOpen?"OPEN":"CLOSED");
    if(doorOpen && rtcOK)
      Firebase.RTDB.setString(&fbdo,DEVICE+"/lastOpened",nowText());
  }

  if(doorOpen && alarmOn) medicineTaken();
  showStatus();
}

void startAlarm(){
  alarmOn=true;
  digitalWrite(BUZZER_PIN,BUZZER_ON);
  unlockCabinet();

  if(firebaseOK){
    Firebase.RTDB.setString(&fbdo,DEVICE+"/doseStatus","WAITING");
    saveHistory("ALERT",rtcOK?nowText():"-");
  }

  if(oledOK){
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0,5);
    display.println("MEDICINE TIME");
    display.println(medicineName);
    display.print("Time: "); display.println(medicineTime);
    display.display();
  }
}

void checkMedicineTime(){
  if(!rtcOK || !scheduleEnabled) return;

  RtcDateTime t=rtc.GetDateTime();
  String tm=two(t.Hour())+":"+two(t.Minute());
  String dt=String(t.Year())+"-"+two(t.Month())+"-"+two(t.Day());

  if(tm==medicineTime && (dt!=lastAlarmDate || tm!=lastAlarmTime)){
    lastAlarmDate=dt;
    lastAlarmTime=tm;
    startAlarm();
  }
}

void setup(){
  Serial.begin(115200);

  pinMode(REED_PIN,INPUT_PULLUP);
  pinMode(BUZZER_PIN,OUTPUT);
  digitalWrite(BUZZER_PIN,BUZZER_OFF);

  Wire.begin(SDA_PIN,SCL_PIN);
  oledOK=display.begin(SSD1306_SWITCHCAPVCC,0x3C);
  if(!oledOK) oledOK=display.begin(SSD1306_SWITCHCAPVCC,0x3D);

  rtc.Begin();
  if(rtc.GetIsWriteProtected()) rtc.SetIsWriteProtected(false);
  if(!rtc.GetIsRunning()) rtc.SetIsRunning(true);
  if(!rtc.IsDateTimeValid()) rtc.SetDateTime(RtcDateTime(__DATE__,__TIME__));
  rtcOK=rtc.IsDateTimeValid();

  moveServo(LOCK_ANGLE);
  isLocked=true;

  connectWiFi();
  if(WiFi.status()==WL_CONNECTED) setupFirebase();

  doorOpen=lastDoorOpen=digitalRead(REED_PIN);

  if(firebaseOK){
    heartbeat();
    readSchedule();
    readLock();
  }

  showStatus();
}

void loop(){
  checkDoor();
  checkMedicineTime();

  if(firebaseOK && Firebase.ready()){
    unsigned long now=millis();

    if(now-tCmd>=1000){ tCmd=now; readLock(); }
    if(now-tSchedule>=10000){ tSchedule=now; readSchedule(); }
    if(now-tHeartbeat>=10000){ tHeartbeat=now; heartbeat(); }
  }

  delay(50);
}
