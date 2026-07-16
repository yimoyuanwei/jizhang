import { app } from 'nitron'

app.init({
  name: "记账本",
  packageId: "com.moneytracker.app",
  version: "1.0.0",
  entry: "standalone.html",
  orientation: "portrait",
  statusBar: true,
  permissions: ["INTERNET"],
  icon: "./icon.svg",
})
