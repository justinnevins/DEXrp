# DEXrp - Capacitor Build Guide

## Overview

**DEXrp** is now fully configured for Capacitor! The app can be built as standalone native Android and iOS applications.

**App Details:**
- **App Name:** DEXrp
- **App ID:** me.dexrp.app
- **Web Domain:** dexrp.me

## What's Been Done

1. ✅ Installed Capacitor core packages (@capacitor/core, @capacitor/cli, @capacitor/android, @capacitor/ios)
2. ✅ Created `capacitor.config.ts` with app configuration
3. ✅ Added platform detection utility (`client/src/lib/platform.ts`)
4. ✅ XRPL client uses WebSocket connections for all platforms
5. ✅ Installed native barcode scanning plugin (@capacitor-mlkit/barcode-scanning)
6. ✅ Created Android and iOS project folders with proper package names

## Key Features

### Standalone Operation
- Native apps connect directly to XRPL nodes via WebSocket
- All data is stored in browser/native storage (no database dependency)
- The APK/IPA works completely offline from your Replit backend

### Platform Detection
The app automatically detects if it's running as:
- Web browser
- Native Android/iOS

## Building the Android APK

### Prerequisites
1. Install Java Development Kit (JDK 21 or higher)
   ```bash
   # Check if Java is installed
   java -version
   ```

2. Install Android Studio from https://developer.android.com/studio

3. Set ANDROID_HOME environment variable
   ```bash
   # macOS/Linux - add to ~/.bashrc or ~/.zshrc
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   
   # Windows - set in System Environment Variables
   ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
   ```

### Build Steps

1. **Clone or download your Replit project to your local machine**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the web assets:**
   ```bash
   npm run build
   ```

4. **Sync with Capacitor:**
   ```bash
   npx cap sync android
   ```

5. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```

6. **Build the APK in Android Studio:**
   - Wait for Gradle sync to complete
   - Go to **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
   - The APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`

### Command Line Build (Alternative)
```bash
cd android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release Build (For Distribution)
```bash
cd android
./gradlew assembleRelease
```

**Note:** Release builds require signing configuration. See Android documentation for setting up a keystore.

## Building for iOS

### Prerequisites
- **macOS** with Xcode installed
- Apple Developer account (free account works for testing)

### Build Steps

1. **Build the web assets:**
   ```bash
   npm run build
   ```

2. **Sync with Capacitor:**
   ```bash
   npx cap sync ios
   ```

3. **Open in Xcode:**
   ```bash
   npx cap open ios
   ```

4. **Configure signing in Xcode:**
   - Select the **App** target
   - Go to **Signing & Capabilities**
   - Select your team
   - Xcode will automatically create a provisioning profile

5. **Build and run:**
   - Select your device or simulator
   - Click the **Play** button to build and run
   - For distribution: **Product** → **Archive**

## Testing the Apps

### Sideloading on Android
1. Enable "Developer Mode" on your Android device:
   - Go to **Settings** → **About Phone**
   - Tap **Build Number** 7 times
2. Enable "Install Unknown Apps" for your file manager
3. Transfer the APK to your phone (via USB, cloud, or email)
4. Tap the APK file to install
5. Launch DEXrp!

### Testing on iOS
1. **Using Xcode:**
   - Connect your iPhone via USB
   - Select it as the build target
   - Click Run
   
2. **Using TestFlight (for beta testing):**
   - Archive the app in Xcode
   - Upload to App Store Connect
   - Invite testers via TestFlight

**Note:** Free Apple accounts have limitations (7-day app expiry, limited devices)

## Development Workflow

1. **Develop features:** Work in Replit, test in the web browser
2. **Build for mobile:** 
   ```bash
   npm run build
   npx cap sync
   ```
3. **Test on device:** Sideload the APK or use Xcode
4. **Iterate:** Make changes, rebuild, and test

## Helpful Commands

```bash
# Sync web assets to native projects
npx cap sync

# Sync specific platform
npx cap sync android
npx cap sync ios

# Open in IDE
npx cap open android
npx cap open ios

# Update Capacitor
npm install @capacitor/core@latest @capacitor/cli@latest
npx cap sync

# Build web assets
npm run build

# Clean build (if you run into issues)
cd android && ./gradlew clean
# Or delete android/ and ios/ folders and re-run:
npx cap add android
npx cap add ios
```

## App Configuration

The app is configured in `capacitor.config.ts`:
```typescript
{
  appId: 'me.dexrp.app',
  appName: 'dexrp',
  webDir: 'dist/public'
}
```

You can customize these settings before building.

## Publishing to App Stores

### Google Play Store (Android)
1. Create a Google Play Developer account ($25 one-time fee)
2. Build a signed release APK or AAB (Android App Bundle)
3. Create app listing in Google Play Console
4. Upload APK/AAB and submit for review

### Apple App Store (iOS)
1. Enroll in Apple Developer Program ($99/year)
2. Archive the app in Xcode
3. Upload to App Store Connect
4. Create app listing and submit for review

## Troubleshooting

### Gradle Build Fails
- Make sure Java 21+ is installed
- Delete `android/.gradle` and rebuild
- Run `./gradlew clean` in the android directory

### iOS Build Fails
- Update Xcode to the latest version
- Run `pod install` in the `ios/App` directory
- Clean build folder: **Product** → **Clean Build Folder**

### App Crashes on Launch
- Check logs in Android Studio (Logcat) or Xcode (Console)
- Ensure `npm run build` completed successfully
- Verify `npx cap sync` ran without errors

### QR Scanner Not Working
- Grant camera permissions when prompted
- Check that @capacitor-mlkit/barcode-scanning is installed
- On iOS, verify camera usage description is in Info.plist

## Next Steps

1. ✅ Test the web version thoroughly on Replit (https://dexrp.me when deployed)
2. Download the project to your local machine
3. Install Java and Android Studio (or Xcode for iOS)
4. Build the Android APK or iOS app
5. Sideload and test on your device!

## Support

For Capacitor-specific issues, check:
- Capacitor Documentation: https://capacitorjs.com/docs
- Capacitor Discord: https://discord.gg/UPYUybV

For DEXrp app issues:
- Open an issue on GitHub
- Check XRPL documentation: https://xrpl.org

---

**Happy building! 🚀**

Your DEXrp app is ready to go mobile!
