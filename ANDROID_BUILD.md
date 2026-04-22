# Building DEXrp for Android

This guide explains how to build the DEXrp Android app locally.

## Prerequisites

1. **Android Studio** installed with:
   - Android SDK
   - Android Build Tools
   - Java Development Kit (JDK 21 or higher)

2. **Node.js** and npm installed

3. **Capacitor CLI** (already included in project dependencies)

## Build Steps

### 1. Configure Backend URL

Before building the Android app, you must set the backend API URL:

```bash
# Create a .env file in the project root
cp .env.example .env

# Edit .env and set VITE_API_BASE_URL to your deployed backend
# Example: VITE_API_BASE_URL=https://dexrp.me
```

**Important:** The native app cannot use relative API paths like `/api/...`. It must connect to an absolute URL where your backend is deployed.

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Web Assets

```bash
npm run build
```

### 4. Sync Capacitor

```bash
npx cap sync android
```

### 5. Open in Android Studio

```bash
npx cap open android
```

This will open the project in Android Studio.

### 6. Build APK or AAB

In Android Studio:
- **For Debug APK**: Build > Build Bundle(s) / APK(s) > Build APK(s)
- **For Release AAB**: Build > Build Bundle(s) / APK(s) > Build Bundle(s)

Or using Gradle from command line:

```bash
cd android
./gradlew assembleDebug  # For debug APK
./gradlew bundleRelease  # For release AAB
```

## Updating Camera Permissions (Already Done)

The Android app requires camera permissions for QR code scanning. These have been pre-configured in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
```

## Testing the Build

1. Connect an Android device via USB with USB debugging enabled, or start an Android emulator
2. In Android Studio, click the "Run" button or use:
   ```bash
   cd android
   ./gradlew installDebug
   ```

## Environment Variables

The native app requires these environment variables to be set at build time:

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Backend API endpoint | `https://dexrp.me` |

**Note:** Environment variables prefixed with `VITE_` are embedded into the build at compile time and cannot be changed after the app is built.

## Common Issues

### "SDK location not found"

Set the ANDROID_HOME environment variable or create `android/local.properties`:

```properties
sdk.dir=/path/to/your/Android/sdk
```

### "JAVA_HOME not set"

Ensure JDK 21+ is installed and JAVA_HOME is set:

```bash
export JAVA_HOME=/path/to/jdk
```

### API calls failing in the app

Verify that:
1. `VITE_API_BASE_URL` is set correctly in your `.env` file
2. You've rebuilt the app after changing environment variables
3. The backend server is accessible from your device/emulator

## Platform Detection

The app automatically detects if it's running as a native app and adjusts API calls accordingly. The `apiFetch` helper in `client/src/lib/queryClient.ts` handles this:

- **Web app**: Uses relative paths like `/api/...`
- **Native app**: Prepends `VITE_API_BASE_URL` to all API paths

## Building on Replit

Building Android apps directly on Replit is not recommended due to:
- Missing Android SDK (requires ~8GB download)
- Limited compute resources for Gradle builds
- No Android emulator support

Instead:
1. Develop and test the web version on Replit
2. Build the Android app locally using the steps above
3. Use GitHub Actions or other CI/CD for automated builds

## Deployment

For production deployment:

1. Update `VITE_API_BASE_URL` to your production backend (e.g., `https://dexrp.me`)
2. Build a release AAB: `./gradlew bundleRelease`
3. Sign the AAB with your release keystore
4. Upload to Google Play Console

Refer to [Capacitor's deployment guide](https://capacitorjs.com/docs/android/deploying-to-google-play) for detailed instructions.
