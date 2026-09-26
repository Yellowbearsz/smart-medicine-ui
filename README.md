# Smart Medicine Cabinet UI

UI เว็บแอป React + Vite เลียนแบบหน้าจอต้นแบบ Smart Medicine Cabinet

## Run
```bash
npm install
npm run dev
```

## Build for Render
```bash
npm run build
```

Render settings:
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

ตอนนี้เป็น UI + Local State เท่านั้น ขั้นถัดไปสามารถเชื่อม Firebase Realtime Database ให้ Connected, LOCK/UNLOCK, Next Dose, Cabinet Status และ Last Opened ทำงานแบบ Realtime ได้
